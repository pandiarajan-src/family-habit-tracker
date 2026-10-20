"""REQ-001: sign a device in with the family passcode."""

import logging
import re
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime as dt
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.support import (
    FAMILY,
    NOW,
    SESSION,
    SESSIONS,
    WRONG_PASSCODE,
    SeededFamily,
    session_cookie_headers,
    unlock,
)

pytestmark = pytest.mark.req("REQ-001")

# Every Phase 1 data route, with a body that would be valid for a signed-in parent.
PHASE_1_DATA_ROUTES = [
    ("GET", SESSION, None),
    ("PATCH", SESSION, {"acting_member_id": None}),
    ("DELETE", SESSION, None),
    ("GET", FAMILY, None),
    ("PATCH", FAMILY, {"timezone": "Europe/London"}),
]
NO_SESSION_NEEDED = {("POST", SESSIONS), ("GET", "/api/v1/health")}


def test_req_001_correct_passcode_creates_family_session_without_acting_member(
    anon: TestClient, family: SeededFamily
) -> None:
    response = unlock(anon, family.passcode)

    assert response.status_code == 201
    body = response.json()
    assert body["family_id"] == str(family.id)
    assert body["acting_member"] is None
    assert dt.fromisoformat(body["expires_at"]) == NOW + timedelta(minutes=5)
    assert anon.get(SESSION).status_code == 200


def test_req_001_session_cookie_is_httponly_samesite_lax(
    anon: TestClient, family: SeededFamily
) -> None:
    response = unlock(anon, family.passcode)

    [cookie] = session_cookie_headers(response)
    flags = cookie.lower()
    assert "httponly" in flags
    assert "samesite=lax" in flags
    # Off for http://localhost under test settings; see the next test for prod.
    assert "secure" not in flags.split(";")[1:]


def test_req_001_session_cookie_is_secure_when_cookie_secure_setting_is_on(
    settings: Settings, clock, family: SeededFamily
) -> None:
    secure_app = create_app(replace(settings, cookie_secure=True), clock=clock)

    with TestClient(secure_app, base_url="https://testserver") as device:
        response = unlock(device, family.passcode)

    assert response.status_code == 201
    [cookie] = session_cookie_headers(response)
    assert "secure" in [flag.strip() for flag in cookie.lower().split(";")]


def test_req_001_session_id_is_at_least_128_bits(anon: TestClient, family: SeededFamily) -> None:
    response = unlock(anon, family.passcode)

    [cookie] = session_cookie_headers(response)
    session_id = cookie.split(";")[0].split("=", 1)[1]
    # 128 bits is 22 base64url characters or 32 hex characters.
    assert len(session_id) >= 22


def test_req_001_wrong_passcode_returns_401_and_creates_no_session(
    anon: TestClient, family: SeededFamily
) -> None:
    response = unlock(anon, WRONG_PASSCODE)

    assert response.status_code == 401
    assert "detail" in response.json()
    assert session_cookie_headers(response) == []
    assert anon.get(SESSION).status_code == 401


def test_req_001_missing_passcode_returns_422(anon: TestClient, family: SeededFamily) -> None:
    response = anon.post(SESSIONS, json={})

    assert response.status_code == 422
    assert "detail" in response.json()


def test_req_001_eleventh_attempt_within_15_minutes_returns_429_even_with_correct_passcode(
    anon: TestClient, family: SeededFamily, clock
) -> None:
    for _ in range(10):
        assert unlock(anon, WRONG_PASSCODE).status_code == 401
        clock.advance(timedelta(minutes=1))

    response = unlock(anon, family.passcode)

    assert response.status_code == 429
    assert "detail" in response.json()
    assert session_cookie_headers(response) == []


def test_req_001_passcode_limit_clears_after_15_minutes(
    anon: TestClient, family: SeededFamily, clock
) -> None:
    for _ in range(10):
        assert unlock(anon, WRONG_PASSCODE).status_code == 401
    clock.advance(timedelta(minutes=15, seconds=1))

    assert unlock(anon, family.passcode).status_code == 201


@pytest.mark.parametrize(("method", "path", "body"), PHASE_1_DATA_ROUTES)
def test_req_001_data_routes_without_session_return_401(
    client: TestClient, method: str, path: str, body: dict | None
) -> None:
    response = client.request(method, path, json=body)

    assert response.status_code == 401
    assert "detail" in response.json()


def test_req_001_every_api_route_except_passcode_entry_and_health_requires_session(
    client: TestClient,
) -> None:
    # Read routes from OpenAPI: FastAPI nests included routers, so `app.routes` isn't flat.
    paths = client.get("/openapi.json").json()["paths"]
    routes = [(method.upper(), path) for path, ops in paths.items() for method in ops]
    # Guard against a vacuous pass: the Phase 1 routes must be among the ones checked.
    assert {(method, path) for method, path, _ in PHASE_1_DATA_ROUTES} <= set(routes)

    for method, path in routes:
        if (method, path) in NO_SESSION_NEEDED:
            continue
        url = re.sub(r"\{[^}]+\}", str(uuid4()), path)
        response = client.request(method, url, json={} if method != "GET" else None)
        assert response.status_code == 401, f"{method} {path} -> {response.status_code}"


def test_req_001_passcode_never_appears_in_logs(
    make_client: Callable[[], TestClient],
    family: SeededFamily,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    device = make_client()

    unlock(device, WRONG_PASSCODE)
    unlock(device, family.passcode)

    assert WRONG_PASSCODE not in caplog.text
    assert family.passcode not in caplog.text
