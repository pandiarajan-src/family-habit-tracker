"""REQ-003: choose who's checking in with a member PIN."""

import logging
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    FAMILY,
    FAMILY_TZ,
    SESSION,
    WRONG_PIN,
    SeededFamily,
    act_as,
    csrf,
    set_timezone,
    without_ids,
)

pytestmark = pytest.mark.req("REQ-003")


def test_req_003_correct_pin_makes_member_the_acting_member(
    unlocked: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]

    response = act_as(unlocked, mia)

    assert response.status_code == 200
    acting = response.json()["acting_member"]
    assert acting["id"] == str(mia.id)
    assert acting["nickname"] == "Mia"
    assert acting["role"] == "child"
    assert unlocked.get(SESSION).json()["acting_member"]["id"] == str(mia.id)


def test_req_003_wrong_pin_returns_401_and_sets_no_acting_member(
    unlocked: TestClient, family: SeededFamily
) -> None:
    response = act_as(unlocked, family["Mia"], pin=WRONG_PIN)

    assert response.status_code == 401
    assert "detail" in response.json()
    assert unlocked.get(SESSION).json()["acting_member"] is None


def test_req_003_sixth_attempt_after_five_wrong_pins_returns_429_even_with_correct_pin(
    unlocked: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]
    for _ in range(5):
        assert act_as(unlocked, mia, pin=WRONG_PIN).status_code == 401

    response = act_as(unlocked, mia)

    assert response.status_code == 429
    assert "detail" in response.json()
    assert unlocked.get(SESSION).json()["acting_member"] is None


def test_req_003_lockout_affects_only_the_locked_member(
    unlocked: TestClient, family: SeededFamily
) -> None:
    for _ in range(5):
        act_as(unlocked, family["Mia"], pin=WRONG_PIN)

    response = act_as(unlocked, family["Kavi"])

    assert response.status_code == 200
    assert response.json()["acting_member"]["id"] == str(family["Kavi"].id)


def test_req_003_lockout_clears_after_5_minutes(
    unlocked: TestClient, family: SeededFamily, clock
) -> None:
    mia = family["Mia"]
    for _ in range(5):
        act_as(unlocked, mia, pin=WRONG_PIN)
    # A person-initiated request at 4 minutes keeps the family session alive (REQ-004).
    clock.advance(timedelta(minutes=4))
    assert unlocked.get(SESSION).status_code == 200
    clock.advance(timedelta(minutes=1, seconds=1))

    assert act_as(unlocked, mia).status_code == 200


@pytest.mark.parametrize("pin", ["357", "35791", "12a4", ""])
def test_req_003_pin_not_exactly_4_digits_returns_422(
    unlocked: TestClient, family: SeededFamily, pin: str
) -> None:
    response = act_as(unlocked, family["Mia"], pin=pin)

    assert response.status_code == 422


def test_req_003_choosing_member_without_pin_returns_422(
    unlocked: TestClient, family: SeededFamily
) -> None:
    response = unlocked.patch(
        SESSION, json={"acting_member_id": str(family["Mia"].id)}, headers=csrf(unlocked)
    )

    assert response.status_code == 422
    assert unlocked.get(SESSION).json()["acting_member"] is None


def test_req_003_unknown_member_returns_404(unlocked: TestClient, family: SeededFamily) -> None:
    response = unlocked.patch(
        SESSION, json={"acting_member_id": str(uuid4()), "pin": "1357"}, headers=csrf(unlocked)
    )

    assert response.status_code == 404
    assert "detail" in response.json()


def test_req_003_write_without_acting_member_returns_403(unlocked: TestClient) -> None:
    response = set_timezone(unlocked, "Asia/Kolkata")

    assert response.status_code == 403
    assert unlocked.get(FAMILY).json()["timezone"] == FAMILY_TZ


def test_req_003_read_without_acting_member_still_works(
    unlocked: TestClient, family: SeededFamily
) -> None:
    assert unlocked.get(FAMILY).status_code == 200
    assert unlocked.get(SESSION).status_code == 200


def test_req_003_pin_attempt_logs_contain_no_nickname_or_pin(
    unlocked: TestClient, family: SeededFamily, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    mia = family["Mia"]

    act_as(unlocked, mia, pin=WRONG_PIN)
    act_as(unlocked, mia)

    logged = without_ids(caplog.text)
    assert "Mia" not in logged
    assert WRONG_PIN not in logged
    assert mia.pin not in logged
