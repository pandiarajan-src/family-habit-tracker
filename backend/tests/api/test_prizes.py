"""REQ-024 parents manage prizes, REQ-025 claim a prize, REQ-026 approve or decline claims."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    CLAIMS,
    MEMBERS,
    PRIZES,
    SeededFamily,
    Seeder,
    act_as,
    claim,
    create_prize,
    csrf,
    d,
    decide,
    gems,
    member_path,
)

SEVEN_DAY_STREAK = [d(-6), d(-5), d(-4), d(-3), d(-2), d(-1), d(0)]  # a 7-day streak: 19 gems


@pytest.fixture
def mia_has_19(family: SeededFamily, seed: Seeder) -> None:
    seed.habit(family["Mia"], "Reading", done=SEVEN_DAY_STREAK)


def _prize_path(prize_id) -> str:
    return f"{PRIZES}/{prize_id}"


# ---- REQ-024: prizes ---------------------------------------------------------------------


@pytest.mark.req("REQ-024")
def test_req_024_parent_creates_a_prize_everyone_sees_it(
    as_parent: TestClient, family: SeededFamily
) -> None:
    response = create_prize(as_parent, "Cinema trip", 40)

    assert response.status_code == 201
    assert response.json() | {"id": None} == {"id": None, "title": "Cinema trip", "gem_cost": 40}
    act_as(as_parent, family["Mia"])
    assert [p["title"] for p in as_parent.get(PRIZES).json()] == ["Cinema trip"]


@pytest.mark.req("REQ-024")
@pytest.mark.parametrize(
    "body",
    [
        {"title": "", "gem_cost": 5},
        {"title": "x" * 41, "gem_cost": 5},
        {"title": "Ice cream", "gem_cost": 0},
        {"title": "Ice cream", "gem_cost": 10_001},
        {"title": "Ice cream", "gem_cost": 2.5},
        {"title": "Ice cream", "gem_cost": 5, "stock": 3},
    ],
)
def test_req_024_invalid_prize_returns_422(as_parent: TestClient, body: dict) -> None:
    response = as_parent.post(PRIZES, json=body, headers=csrf(as_parent))

    assert response.status_code == 422
    assert as_parent.get(PRIZES).json() == []


@pytest.mark.req("REQ-024")
def test_req_024_cost_limits_1_and_10000_are_accepted(as_parent: TestClient) -> None:
    assert create_prize(as_parent, "Ice cream", 1).status_code == 201
    assert create_prize(as_parent, "Cinema trip", 10_000).status_code == 201


@pytest.mark.req("REQ-024")
def test_req_024_child_cannot_create_edit_or_delete_a_prize_returns_403(
    as_parent: TestClient, family: SeededFamily
) -> None:
    prize = create_prize(as_parent).json()["id"]
    act_as(as_parent, family["Mia"])

    assert create_prize(as_parent).status_code == 403
    edit = as_parent.patch(_prize_path(prize), json={"gem_cost": 1}, headers=csrf(as_parent))
    assert edit.status_code == 403
    assert as_parent.delete(_prize_path(prize), headers=csrf(as_parent)).status_code == 403
    assert as_parent.get(PRIZES).json()[0]["gem_cost"] == 5


@pytest.mark.req("REQ-024")
def test_req_024_editing_the_cost_keeps_a_pending_claims_cost(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Ice cream", 10).json()["id"]
    act_as(as_parent, family["Mia"])
    claim_id = claim(as_parent, prize).json()["id"]
    act_as(as_parent, family["Mum"])

    edit = as_parent.patch(
        _prize_path(prize), json={"title": "Cinema trip", "gem_cost": 15}, headers=csrf(as_parent)
    )

    assert edit.status_code == 200
    assert edit.json()["gem_cost"] == 15
    [pending] = as_parent.get(CLAIMS).json()
    assert (pending["id"], pending["gem_cost"], pending["prize_title"]) == (
        claim_id,
        10,
        "Ice cream",
    )
    assert gems(as_parent, family["Mia"]) == (9, 10)


@pytest.mark.req("REQ-024")
def test_req_024_delete_with_a_pending_claim_returns_409(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Ice cream", 10).json()["id"]
    act_as(as_parent, family["Mia"])
    claim(as_parent, prize)
    act_as(as_parent, family["Mum"])

    response = as_parent.delete(_prize_path(prize), headers=csrf(as_parent))

    assert response.status_code == 409
    assert len(as_parent.get(PRIZES).json()) == 1


@pytest.mark.req("REQ-024")
def test_req_024_delete_returns_204_and_past_claims_keep_title_and_cost(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Ice cream", 10).json()["id"]
    act_as(as_parent, family["Mia"])
    claim_id = claim(as_parent, prize).json()["id"]
    act_as(as_parent, family["Mum"])
    decide(as_parent, claim_id, "approved")

    response = as_parent.delete(_prize_path(prize), headers=csrf(as_parent))

    assert response.status_code == 204
    assert as_parent.get(PRIZES).json() == []
    [past] = as_parent.get(CLAIMS).json()
    assert (past["prize_id"], past["prize_title"], past["gem_cost"]) == (None, "Ice cream", 10)


@pytest.mark.req("REQ-024")
@pytest.mark.parametrize("method", ["patch", "delete"])
def test_req_024_unknown_prize_returns_404(as_parent: TestClient, method: str) -> None:
    kwargs = {"json": {"gem_cost": 3}} if method == "patch" else {}

    response = getattr(as_parent, method)(_prize_path(uuid4()), headers=csrf(as_parent), **kwargs)

    assert response.status_code == 404


@pytest.mark.req("REQ-024")
def test_req_024_prizes_listed_cheapest_first_with_no_acting_member(
    as_parent: TestClient, unlocked: TestClient
) -> None:
    create_prize(as_parent, "Cinema trip", 40)
    create_prize(as_parent, "Ice cream", 5)

    assert [p["gem_cost"] for p in unlocked.get(PRIZES).json()] == [5, 40]


# ---- REQ-025: claims -----------------------------------------------------------------------


@pytest.mark.req("REQ-025")
def test_req_025_claim_with_enough_gems_returns_201_and_holds_the_cost(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    mia = family["Mia"]
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    act_as(as_parent, mia)

    response = claim(as_parent, prize)

    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["member_id"], body["gem_cost"]) == ("pending", str(mia.id), 15)
    assert body["requested_at"].endswith("+01:00")
    assert body["decided_at"] is None
    assert gems(as_parent, mia) == (4, 15)
    pending = as_parent.get(CLAIMS, params={"status": "pending"}).json()
    assert [c["id"] for c in pending] == [body["id"]]


@pytest.mark.req("REQ-025")
def test_req_025_claim_without_enough_gems_returns_409_with_gems_to_go(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Cinema trip", 31).json()["id"]
    act_as(as_parent, family["Mia"])

    response = claim(as_parent, prize)

    assert response.status_code == 409
    assert response.json()["detail"] == "12 more gems to go!"
    assert gems(as_parent, family["Mia"]) == (19, 0)
    assert as_parent.get(CLAIMS).json() == []


@pytest.mark.req("REQ-025")
def test_req_025_claim_for_an_unknown_prize_returns_404(as_child: TestClient) -> None:
    assert claim(as_child, uuid4()).status_code == 404


@pytest.mark.req("REQ-025")
def test_req_025_claimant_cancels_and_the_held_gems_come_back(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    mia = family["Mia"]
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    act_as(as_parent, mia)
    claim_id = claim(as_parent, prize).json()["id"]

    response = decide(as_parent, claim_id, "cancelled")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["decided_by_member_id"] == str(mia.id)
    assert gems(as_parent, mia) == (19, 0)


@pytest.mark.req("REQ-025")
def test_req_025_only_the_claimant_can_cancel_returns_403(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Ice cream", 5).json()["id"]
    act_as(as_parent, family["Mia"])
    claim_id = claim(as_parent, prize).json()["id"]
    act_as(as_parent, family["Kavi"])

    assert decide(as_parent, claim_id, "cancelled").status_code == 403


@pytest.mark.req("REQ-025")
def test_req_025_claims_filter_by_member(
    as_parent: TestClient, family: SeededFamily, mia_has_19
) -> None:
    prize = create_prize(as_parent, "Ice cream", 5).json()["id"]
    act_as(as_parent, family["Mia"])
    claim(as_parent, prize)

    mias = as_parent.get(CLAIMS, params={"member_id": str(family["Mia"].id)}).json()
    kavis = as_parent.get(CLAIMS, params={"member_id": str(family["Kavi"].id)}).json()
    bad = as_parent.get(CLAIMS, params={"status": "lost"})

    assert (len(mias), kavis, bad.status_code) == (1, [], 422)


# ---- REQ-026: decisions --------------------------------------------------------------------


@pytest.fixture
def mias_claim(as_parent: TestClient, family: SeededFamily, mia_has_19) -> str:
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    act_as(as_parent, family["Mia"])
    claim_id = claim(as_parent, prize).json()["id"]
    act_as(as_parent, family["Mum"])
    return claim_id


@pytest.mark.req("REQ-026")
def test_req_026_parent_approves_and_the_held_gems_are_spent(
    as_parent: TestClient, family: SeededFamily, mias_claim: str
) -> None:
    response = decide(as_parent, mias_claim, "approved")

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["decided_by_member_id"]) == ("approved", str(family["Mum"].id))
    assert body["decided_at"].endswith("+01:00")
    assert gems(as_parent, family["Mia"]) == (4, 0)


@pytest.mark.req("REQ-026")
def test_req_026_parent_declines_and_the_gems_go_back(
    as_parent: TestClient, family: SeededFamily, mias_claim: str
) -> None:
    response = decide(as_parent, mias_claim, "declined")

    assert response.status_code == 200
    assert response.json()["status"] == "declined"
    assert gems(as_parent, family["Mia"]) == (19, 0)


@pytest.mark.req("REQ-026")
@pytest.mark.parametrize("status", ["approved", "declined"])
def test_req_026_child_cannot_decide_a_claim_returns_403(
    as_parent: TestClient, family: SeededFamily, mias_claim: str, status: str
) -> None:
    act_as(as_parent, family["Mia"])

    assert decide(as_parent, mias_claim, status).status_code == 403


@pytest.mark.req("REQ-026")
@pytest.mark.parametrize("second", ["approved", "declined", "cancelled"])
def test_req_026_claim_that_is_not_pending_returns_409(
    as_parent: TestClient, family: SeededFamily, mias_claim: str, second: str
) -> None:
    decide(as_parent, mias_claim, "declined")
    if second == "cancelled":
        act_as(as_parent, family["Mia"])

    response = decide(as_parent, mias_claim, second)

    assert response.status_code == 409
    assert gems(as_parent, family["Mia"]) == (19, 0)  # released once, not twice


@pytest.mark.req("REQ-026")
@pytest.mark.parametrize("status", ["pending", "lost"])
def test_req_026_unknown_status_returns_422(
    as_parent: TestClient, mias_claim: str, status: str
) -> None:
    assert decide(as_parent, mias_claim, status).status_code == 422


@pytest.mark.req("REQ-026")
def test_req_026_unknown_claim_returns_404(as_parent: TestClient) -> None:
    assert decide(as_parent, uuid4(), "approved").status_code == 404


@pytest.mark.req("REQ-026")
def test_req_026_own_claim_with_two_parents_returns_403(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    seed.habit(family["Mum"], "Swimming", done=SEVEN_DAY_STREAK)
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    claim_id = claim(as_parent, prize).json()["id"]

    own = decide(as_parent, claim_id, "approved")
    act_as(as_parent, family["Dad"])
    other = decide(as_parent, claim_id, "approved")

    assert own.status_code == 403
    assert other.status_code == 200


@pytest.mark.req("REQ-026")
def test_req_026_own_claim_with_one_parent_returns_200(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    assert as_parent.delete(member_path(family["Dad"]), headers=csrf(as_parent)).status_code == 204
    seed.habit(family["Mum"], "Swimming", done=SEVEN_DAY_STREAK)
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    claim_id = claim(as_parent, prize).json()["id"]

    response = decide(as_parent, claim_id, "declined")

    assert response.status_code == 200
    assert len([m for m in as_parent.get(MEMBERS).json() if m["role"] == "parent"]) == 1


@pytest.mark.req("REQ-024")
def test_req_024_renaming_a_prize_keeps_its_cost(as_parent: TestClient) -> None:
    prize = create_prize(as_parent, "Ice cream", 7).json()["id"]

    response = as_parent.patch(
        _prize_path(prize), json={"title": "Cinema trip"}, headers=csrf(as_parent)
    )

    assert response.status_code == 200
    assert response.json() | {"id": None} == {"id": None, "title": "Cinema trip", "gem_cost": 7}
