"""Sample data and request helpers shared by the API tests.

Fixtures follow REQ-020, not the mockup data: Dad 🦉 / Mum 🌻 / Mia 🐬 / Kavi 🦖,
today = Tue 20 Oct 2026 in Europe/London.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fastapi.testclient import TestClient
from httpx import Response
from sqlmodel import Session

# Tue 20 Oct 2026, 09:00 in Europe/London (BST, UTC+01:00).
NOW = datetime(2026, 10, 20, 8, 0, tzinfo=UTC)

SESSIONS = "/api/v1/sessions"
SESSION = "/api/v1/sessions/current"
FAMILY = "/api/v1/families/current"
BACKGROUND = {"X-Background-Refresh": "1"}

FAMILY_TZ = "Europe/London"
PASSCODE = "owl-sunflower-26"
WRONG_PASSCODE = "not-our-passcode"
WRONG_PIN = "9021"

# (nickname, avatar, role, pin). PINs avoid repeated digits so they are easy to spot in logs.
SAMPLE_MEMBERS = (
    ("Dad", "🦉", "parent", "1357"),
    ("Mum", "🌻", "parent", "2468"),
    ("Mia", "🐬", "child", "3579"),
    ("Kavi", "🦖", "child", "4680"),
)

OTHER_PASSCODE = "kestrel-meadow-99"
OTHER_MEMBERS = (("Gran", "🦔", "parent", "5791"),)

MEMBER_READ_FIELDS = {"id", "nickname", "avatar_emoji", "role", "gem_balance", "gems_held"}


@dataclass(frozen=True, slots=True)
class Person:
    id: UUID
    nickname: str
    avatar_emoji: str
    role: str
    pin: str


@dataclass(frozen=True, slots=True)
class SeededFamily:
    id: UUID
    passcode: str
    members: dict[str, Person]

    def __getitem__(self, nickname: str) -> Person:
        return self.members[nickname]


def csrf(client: TestClient) -> dict[str, str]:
    """Double-submit header: echo the `csrf_token` cookie set by `POST /sessions`."""
    return {"X-CSRF-Token": client.cookies.get("csrf_token", "")}


def unlock(client: TestClient, passcode: str = PASSCODE) -> Response:
    return client.post(SESSIONS, json={"passcode": passcode})


def act_as(client: TestClient, person: Person, pin: str | None = None) -> Response:
    body = {"acting_member_id": str(person.id), "pin": person.pin if pin is None else pin}
    return client.patch(SESSION, json=body, headers=csrf(client))


def switch_person(client: TestClient) -> Response:
    return client.patch(SESSION, json={"acting_member_id": None}, headers=csrf(client))


def set_timezone(client: TestClient, timezone: str) -> Response:
    return client.patch(FAMILY, json={"timezone": timezone}, headers=csrf(client))


def session_cookie_headers(response: Response) -> list[str]:
    """`Set-Cookie` headers other than the CSRF cookie (the session cookie's name is not fixed)."""
    return [
        header
        for header in response.headers.get_list("set-cookie")
        if not header.startswith("csrf_token=")
    ]


_UUID = re.compile(r"[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}", re.I)


def without_ids(text: str) -> str:
    """Drop UUIDs so a PIN can't match by chance inside an ID that a log line rightly carries."""
    return _UUID.sub("<id>", text)


# ---- Phase 3: resource API --------------------------------------------------------------

API = "/api/v1"
MEMBERS = f"{API}/members"
HABITS = f"{API}/habits"
CHECK_INS = f"{API}/check-ins"
STREAK_SAVERS = f"{API}/streak-savers"
PRIZES = f"{API}/prizes"
CLAIMS = f"{API}/prize-claims"
ADJUSTMENTS = f"{API}/adjustments"

TODAY = date(2026, 10, 20)  # the family date at NOW (a Tuesday)
NEW_PIN = "8642"
SEEDED_CREATED_ON = date(2026, 8, 21)  # 60 days before today

# Free text the API stores but must never log [child-data-privacy #2]. Tests that create
# habits, prizes or members use only these, so the log sweep (tests/api/conftest.py) covers them.
HABIT_TITLES = ("Reading", "Piano", "Swimming", "Tidy room", "Football")
GOAL_NOTE = "twenty pages"
PRIZE_TITLES = ("Cinema trip", "Ice cream")
NEW_NICKNAMES = ("Zuzu", "Granny")


def d(offset: int) -> date:
    """A family date relative to today: d(-1) is yesterday."""
    return TODAY + timedelta(days=offset)


def member_path(person: Person) -> str:
    return f"{MEMBERS}/{person.id}"


def habit_path(habit_id: str | UUID) -> str:
    return f"{HABITS}/{habit_id}"


def check_in_path(habit_id: str | UUID, day: date) -> str:
    return f"{HABITS}/{habit_id}/check-ins/{day.isoformat()}"


def create_habit(
    client: TestClient,
    owner: Person,
    title: str = "Reading",
    frequency: str = "daily",
    weekly_target: int | None = None,
    **extra,
) -> Response:
    body = {"member_id": str(owner.id), "title": title, "frequency": frequency, **extra}
    if weekly_target is not None:
        body["weekly_target"] = weekly_target
    return client.post(HABITS, json=body, headers=csrf(client))


def put_check_in(client: TestClient, habit_id: str | UUID, day: date = TODAY) -> Response:
    return client.put(check_in_path(habit_id, day), headers=csrf(client))


def delete_check_in(client: TestClient, habit_id: str | UUID, day: date = TODAY) -> Response:
    return client.delete(check_in_path(habit_id, day), headers=csrf(client))


def use_saver(client: TestClient, habit_id: str | UUID, day: date) -> Response:
    return client.post(
        f"{HABITS}/{habit_id}/streak-savers",
        json={"period_start": day.isoformat()},
        headers=csrf(client),
    )


def gems(client: TestClient, person: Person) -> tuple[int, int]:
    """(available, held) as the Family board shows them."""
    body = client.get(member_path(person)).json()
    return body["gem_balance"], body["gems_held"]


def balance(client: TestClient, person: Person) -> int:
    return gems(client, person)[0]


def create_prize(client: TestClient, title: str = "Cinema trip", gem_cost: int = 5) -> Response:
    return client.post(PRIZES, json={"title": title, "gem_cost": gem_cost}, headers=csrf(client))


def claim(client: TestClient, prize_id: str | UUID) -> Response:
    return client.post(CLAIMS, json={"prize_id": str(prize_id)}, headers=csrf(client))


def decide(client: TestClient, claim_id: str | UUID, status: str) -> Response:
    return client.patch(f"{CLAIMS}/{claim_id}", json={"status": status}, headers=csrf(client))


class Seeder:
    """Writes history straight to the database: habits created weeks ago, old check-ins, spends.

    The API only lets a member check in today or yesterday, so long histories are seeded here.
    """

    def __init__(self, db: Session, family_id: UUID) -> None:
        self.db = db
        self.family_id = family_id

    def habit(
        self,
        owner: Person,
        title: str = "Reading",
        *,
        frequency: str = "daily",
        created_on: date = SEEDED_CREATED_ON,
        target: int | None = None,
        done: Iterable[date] = (),
        saved: Iterable[date] = (),
    ) -> UUID:
        from app.domain.dates import week_start
        from app.models import CheckIn, Frequency, Habit, StreakSaver, WeeklyTarget

        habit = Habit(
            family_id=self.family_id,
            member_id=owner.id,
            title=title,
            frequency=Frequency(frequency),
            created_on=created_on,
        )
        self.db.add(habit)
        self.db.flush()
        if frequency == "weekly":
            self.db.add(
                WeeklyTarget(
                    habit_id=habit.id, effective_from_week=week_start(created_on), target=target
                )
            )
        for day in done:
            self.db.add(CheckIn(habit_id=habit.id, member_id=owner.id, date=day, created_at=NOW))
        for day in saved:
            self.db.add(
                StreakSaver(
                    habit_id=habit.id, member_id=owner.id, period_start=day, cost=1, created_at=NOW
                )
            )
        habit_id = habit.id  # read before commit: a reload would hold an old read snapshot
        self.db.commit()
        return habit_id

    def spend(self, owner: Person, amount: int, kind: str = "prize_hold") -> None:
        """A ledger row with no claim behind it: enough to set up a balance."""
        from app.models import GemTransaction, GemTransactionKind

        self.db.add(
            GemTransaction(
                member_id=owner.id, kind=GemTransactionKind(kind), amount=-amount, created_at=NOW
            )
        )
        self.db.commit()

    def count(self, table: str, where: str = "1=1", *params) -> int:
        """Raw SQL, so the answer comes from the database, not the ORM.

        Each count reads a fresh snapshot, so it sees what the API committed since.
        """
        self.db.rollback()
        sql = f"SELECT count(*) FROM {table} WHERE {where}"  # noqa: S608 - test-only names
        try:
            return self.db.connection().exec_driver_sql(sql, params).scalar_one()
        finally:
            self.db.rollback()
