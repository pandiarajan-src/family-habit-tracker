"""REQ-028: role-based access over every write route.

No session → 401 is swept in test_sessions_passcode.py over every route in OpenAPI. This file adds:
no acting member → 403, wrong role → 403 with nothing changed, and another family's ID → 404.
`WRITE_ROUTES` must list every write route, so a new one can't skip the sweep.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from tests.support import (
    NEW_PIN,
    NOW,
    TODAY,
    SeededFamily,
    Seeder,
    act_as,
    csrf,
    d,
)

pytestmark = pytest.mark.req("REQ-028")

# Rows every table might gain or lose; compared before and after a refused write.
TABLES = (
    "member",
    "member_credential",
    "habit",
    "weekly_target",
    "check_in",
    "streak_saver",
    "gem_transaction",
    "prize",
    "prize_claim",
    "adjustment",
)


@dataclass(frozen=True)
class World:
    """One of each resource, owned by a known member, in one family."""

    members: dict[str, UUID]
    habits: dict[str, UUID]  # by owner nickname
    prize: UUID
    claim: UUID  # the first child's pending claim
    adjustment: UUID  # about the first child


def _build_world(db: Session, family: SeededFamily, child: str, parents: list[str]) -> World:
    from app.models import Adjustment, AdjustmentKind, ClaimStatus, Prize, PrizeClaim

    seed = Seeder(db, family.id)
    habits = {name: seed.habit(family[name], "Reading", done=[d(-2)]) for name in family.members}
    prize = Prize(family_id=family.id, title="Ice cream", gem_cost=1, created_at=NOW)
    db.add(prize)
    db.flush()
    claim = PrizeClaim(
        family_id=family.id,
        prize_id=prize.id,
        prize_title="Ice cream",
        gem_cost=1,
        member_id=family[child].id,
        status=ClaimStatus.pending,
        requested_at=NOW,
    )
    adjustment = Adjustment(
        family_id=family.id,
        target_member_id=family[child].id,
        actor_member_id=family[parents[0]].id,
        kind=AdjustmentKind.check_in_added,
        created_at=NOW,
    )
    db.add_all([claim, adjustment])
    db.commit()
    return World(
        members={name: p.id for name, p in family.members.items()},
        habits=habits,
        prize=prize.id,
        claim=claim.id,
        adjustment=adjustment.id,
    )


@pytest.fixture
def world(db: Session, family: SeededFamily) -> World:
    return _build_world(db, family, "Kavi", ["Mum", "Dad"])


@pytest.fixture
def other_world(db: Session, other_family: SeededFamily) -> World:
    return _build_world(db, other_family, "Gran", ["Gran"])


def _counts(db: Session) -> dict[str, int]:
    db.rollback()
    counts = {
        table: db.connection().exec_driver_sql(f"SELECT count(*) FROM {table}").scalar_one()  # noqa: S608
        for table in TABLES
    }
    db.rollback()
    return counts


# (method, OpenAPI path) → body, given the world and the member the request targets.
type Body = Callable[[World, UUID], dict | None]

WRITE_ROUTES: dict[tuple[str, str], Body] = {
    ("PATCH", "/api/v1/families/current"): lambda w, target: {"timezone": "Asia/Kolkata"},
    ("DELETE", "/api/v1/sessions/current"): lambda w, target: None,
    ("POST", "/api/v1/members"): lambda w, target: {
        "nickname": "Zuzu",
        "avatar_emoji": "🦊",
        "role": "child",
        "pin": NEW_PIN,
    },
    ("PATCH", "/api/v1/members/{member_id}"): lambda w, target: {"role": "parent"},
    ("DELETE", "/api/v1/members/{member_id}"): lambda w, target: None,
    ("PUT", "/api/v1/members/{member_id}/credentials"): lambda w, target: {"pin": NEW_PIN},
    ("POST", "/api/v1/habits"): lambda w, target: {
        "member_id": str(target),
        "title": "Reading",
        "frequency": "daily",
    },
    ("PATCH", "/api/v1/habits/{habit_id}"): lambda w, target: {"title": "Football"},
    ("DELETE", "/api/v1/habits/{habit_id}"): lambda w, target: None,
    ("PUT", "/api/v1/habits/{habit_id}/check-ins/{day}"): lambda w, target: None,
    ("DELETE", "/api/v1/habits/{habit_id}/check-ins/{day}"): lambda w, target: None,
    ("POST", "/api/v1/habits/{habit_id}/streak-savers"): lambda w, target: {
        "period_start": d(-1).isoformat()
    },
    ("POST", "/api/v1/prizes"): lambda w, target: {"title": "Ice cream", "gem_cost": 5},
    ("PATCH", "/api/v1/prizes/{prize_id}"): lambda w, target: {"gem_cost": 3},
    ("DELETE", "/api/v1/prizes/{prize_id}"): lambda w, target: None,
    ("POST", "/api/v1/prize-claims"): lambda w, target: {"prize_id": str(w.prize)},
    ("PATCH", "/api/v1/prize-claims/{claim_id}"): lambda w, target: {"status": "approved"},
    ("PATCH", "/api/v1/adjustments/{adjustment_id}"): lambda w, target: {"acknowledged": True},
}
# Choosing who's checking in is the one write that needs no acting member (REQ-003).
NO_ACTING_MEMBER_NEEDED = {("PATCH", "/api/v1/sessions/current")}


def _url(path: str, world: World, target: str) -> str:
    ids = {
        "member_id": world.members[target],
        "habit_id": world.habits[target],
        "prize_id": world.prize,
        "claim_id": world.claim,
        "adjustment_id": world.adjustment,
        "day": TODAY.isoformat(),
    }
    return re.sub(r"\{(\w+)\}", lambda m: str(ids[m.group(1)]), path)


def _send(client: TestClient, method: str, path: str, world: World, target: str):
    body = WRITE_ROUTES[(method, path)](world, world.members[target])
    return client.request(method, _url(path, world, target), json=body, headers=csrf(client))


def test_req_028_route_table_covers_every_write_route(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    writes = {
        (method.upper(), path) for path, ops in paths.items() for method in ops if method != "get"
    } - {("POST", "/api/v1/sessions")}

    assert writes - NO_ACTING_MEMBER_NEEDED == set(WRITE_ROUTES)


@pytest.mark.parametrize(("method", "path"), list(WRITE_ROUTES), ids=" ".join)
def test_req_028_write_without_acting_member_returns_403(
    unlocked: TestClient, world: World, db: Session, method: str, path: str
) -> None:
    before = _counts(db)

    response = _send(unlocked, method, path, world, "Kavi")

    assert response.status_code == 403, response.text
    assert _counts(db) == before


# Writes a child (Mia) may not make, each aimed at data she doesn't own.
CHILD_REFUSED = [
    ("PATCH", "/api/v1/families/current", "Kavi"),
    ("DELETE", "/api/v1/sessions/current", "Kavi"),
    ("POST", "/api/v1/members", "Kavi"),
    ("PATCH", "/api/v1/members/{member_id}", "Mia"),  # her own role
    ("PATCH", "/api/v1/members/{member_id}", "Kavi"),
    ("DELETE", "/api/v1/members/{member_id}", "Kavi"),
    ("PUT", "/api/v1/members/{member_id}/credentials", "Kavi"),
    ("POST", "/api/v1/habits", "Kavi"),
    ("PATCH", "/api/v1/habits/{habit_id}", "Kavi"),
    ("DELETE", "/api/v1/habits/{habit_id}", "Kavi"),
    ("PUT", "/api/v1/habits/{habit_id}/check-ins/{day}", "Kavi"),
    ("DELETE", "/api/v1/habits/{habit_id}/check-ins/{day}", "Kavi"),
    ("POST", "/api/v1/habits/{habit_id}/streak-savers", "Kavi"),
    ("POST", "/api/v1/prizes", "Kavi"),
    ("PATCH", "/api/v1/prizes/{prize_id}", "Kavi"),
    ("DELETE", "/api/v1/prizes/{prize_id}", "Kavi"),
    ("PATCH", "/api/v1/prize-claims/{claim_id}", "Kavi"),
    ("PATCH", "/api/v1/adjustments/{adjustment_id}", "Kavi"),
]
# Writes a parent (Mum) may not make: the other parent's habits, check-ins, savers and PIN.
PARENT_REFUSED = [
    ("PUT", "/api/v1/members/{member_id}/credentials", "Dad"),
    ("POST", "/api/v1/habits", "Dad"),
    ("PATCH", "/api/v1/habits/{habit_id}", "Dad"),
    ("DELETE", "/api/v1/habits/{habit_id}", "Dad"),
    ("PUT", "/api/v1/habits/{habit_id}/check-ins/{day}", "Dad"),
    ("DELETE", "/api/v1/habits/{habit_id}/check-ins/{day}", "Dad"),
    ("POST", "/api/v1/habits/{habit_id}/streak-savers", "Dad"),
    ("PATCH", "/api/v1/adjustments/{adjustment_id}", "Kavi"),  # only Kavi can dismiss it
]


@pytest.mark.parametrize(
    ("actor", "method", "path", "target"),
    [("Mia", *case) for case in CHILD_REFUSED] + [("Mum", *case) for case in PARENT_REFUSED],
    ids=lambda v: v if isinstance(v, str) else None,
)
def test_req_028_wrong_role_returns_403_and_nothing_changes(
    unlocked: TestClient,
    family: SeededFamily,
    world: World,
    db: Session,
    actor: str,
    method: str,
    path: str,
    target: str,
) -> None:
    act_as(unlocked, family[actor])
    before = _counts(db)

    response = _send(unlocked, method, path, world, target)

    assert response.status_code == 403, response.text
    assert _counts(db) == before


# Routes that take an ID (in the path or the body), with which other-family ID to send.
ID_ROUTES = [
    ("GET", "/api/v1/members/{member_id}"),
    ("GET", "/api/v1/members/{member_id}/gem-transactions"),
    ("PATCH", "/api/v1/members/{member_id}"),
    ("DELETE", "/api/v1/members/{member_id}"),
    ("PUT", "/api/v1/members/{member_id}/credentials"),
    ("POST", "/api/v1/habits"),
    ("GET", "/api/v1/habits/{habit_id}"),
    ("PATCH", "/api/v1/habits/{habit_id}"),
    ("DELETE", "/api/v1/habits/{habit_id}"),
    ("PUT", "/api/v1/habits/{habit_id}/check-ins/{day}"),
    ("DELETE", "/api/v1/habits/{habit_id}/check-ins/{day}"),
    ("POST", "/api/v1/habits/{habit_id}/streak-savers"),
    ("PATCH", "/api/v1/prizes/{prize_id}"),
    ("DELETE", "/api/v1/prizes/{prize_id}"),
    ("POST", "/api/v1/prize-claims"),
    ("PATCH", "/api/v1/prize-claims/{claim_id}"),
    ("PATCH", "/api/v1/adjustments/{adjustment_id}"),
    ("GET", "/api/v1/adjustments"),
]


@pytest.mark.parametrize(("method", "path"), ID_ROUTES, ids=" ".join)
def test_req_028_another_familys_id_returns_404(
    as_parent: TestClient, other_world: World, db: Session, method: str, path: str
) -> None:
    before = _counts(db)
    url = _url(path, other_world, "Gran")
    gran = other_world.members["Gran"]
    body = WRITE_ROUTES.get((method, path), lambda w, target: None)(other_world, gran)
    params = {"member_id": str(gran)} if path.endswith("/adjustments") else None

    response = as_parent.request(method, url, json=body, params=params, headers=csrf(as_parent))

    assert response.status_code == 404, response.text
    assert _counts(db) == before


# Positive controls: the same requests succeed when the actor is allowed, so the 403s and 404s
# above come from the permission checks, not from a broken request.
ALLOWED = [
    ("Mia", "PATCH", "/api/v1/habits/{habit_id}", "Mia", 200),
    ("Mia", "PUT", "/api/v1/habits/{habit_id}/check-ins/{day}", "Mia", 201),
    ("Mia", "PATCH", "/api/v1/members/{member_id}", "Kavi", 403),  # a role change: parents only
    ("Mum", "PATCH", "/api/v1/members/{member_id}", "Kavi", 200),
    ("Mum", "PUT", "/api/v1/members/{member_id}/credentials", "Kavi", 204),
    ("Mum", "POST", "/api/v1/habits", "Kavi", 201),
    ("Mum", "PATCH", "/api/v1/habits/{habit_id}", "Kavi", 200),
    ("Mum", "PUT", "/api/v1/habits/{habit_id}/check-ins/{day}", "Kavi", 201),
    ("Mum", "POST", "/api/v1/habits/{habit_id}/streak-savers", "Kavi", 201),
    ("Mum", "PATCH", "/api/v1/prizes/{prize_id}", "Kavi", 200),
    ("Mum", "PATCH", "/api/v1/prize-claims/{claim_id}", "Kavi", 200),
    ("Kavi", "PATCH", "/api/v1/adjustments/{adjustment_id}", "Kavi", 200),
    ("Mum", "DELETE", "/api/v1/habits/{habit_id}", "Kavi", 204),
    ("Mum", "DELETE", "/api/v1/members/{member_id}", "Kavi", 204),
]


@pytest.mark.parametrize(
    ("actor", "method", "path", "target", "expected"),
    ALLOWED,
    ids=lambda v: v if isinstance(v, str) else None,
)
def test_req_028_allowed_writes_succeed_with_the_same_requests(
    unlocked: TestClient,
    family: SeededFamily,
    world: World,
    actor: str,
    method: str,
    path: str,
    target: str,
    expected: int,
) -> None:
    act_as(unlocked, family[actor])

    response = _send(unlocked, method, path, world, target)

    assert response.status_code == expected, response.text
