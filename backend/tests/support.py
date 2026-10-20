"""Sample data and request helpers shared by the API tests.

Fixtures follow REQ-020, not the mockup data: Dad 🦉 / Mum 🌻 / Mia 🐬 / Kavi 🦖,
today = Tue 20 Oct 2026 in Europe/London.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi.testclient import TestClient
from httpx import Response

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
