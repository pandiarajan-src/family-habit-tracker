"""REQ-004: hand the device over and time out when idle."""

from collections.abc import Callable
from datetime import datetime as dt
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    BACKGROUND,
    FAMILY,
    NOW,
    SESSION,
    SeededFamily,
    act_as,
    set_timezone,
    switch_person,
    unlock,
)

pytestmark = pytest.mark.req("REQ-004")

IDLE_TIMEOUT = timedelta(minutes=5)
JUST_PAST_TIMEOUT = IDLE_TIMEOUT + timedelta(seconds=1)


def test_req_004_done_switch_person_clears_acting_member(as_parent: TestClient) -> None:
    response = switch_person(as_parent)

    assert response.status_code == 200
    assert response.json()["acting_member"] is None
    # Still signed in to the family, but nobody can write as Mum any more.
    assert as_parent.get(FAMILY).status_code == 200
    assert set_timezone(as_parent, "Asia/Kolkata").status_code == 403


def test_req_004_session_idle_for_5_minutes_ends_and_requests_return_401(
    as_parent: TestClient, clock
) -> None:
    # Acting member and family session share the same 5-minute idle timer, so the
    # session has ended too and a missing session is a 401 (REQ-028), for writes as well.
    clock.advance(JUST_PAST_TIMEOUT)

    assert as_parent.get(FAMILY).status_code == 401
    assert set_timezone(as_parent, "Asia/Kolkata").status_code == 401
    assert as_parent.get(SESSION).status_code == 401


def test_req_004_person_initiated_request_at_4_minutes_extends_session(
    as_parent: TestClient, family: SeededFamily, clock
) -> None:
    clock.advance(timedelta(minutes=4))
    assert as_parent.get(FAMILY).status_code == 200
    clock.advance(timedelta(minutes=4))

    response = as_parent.get(SESSION)

    assert response.status_code == 200
    assert response.json()["acting_member"]["id"] == str(family["Mum"].id)


def test_req_004_background_refresh_does_not_extend_session(as_parent: TestClient, clock) -> None:
    clock.advance(timedelta(minutes=4))
    assert as_parent.get(FAMILY, headers=BACKGROUND).status_code == 200
    clock.advance(timedelta(minutes=1, seconds=1))

    assert as_parent.get(FAMILY).status_code == 401


def test_req_004_expires_at_moves_forward_with_activity(unlocked: TestClient, clock) -> None:
    clock.advance(timedelta(minutes=2))

    response = unlocked.get(SESSION)

    assert response.status_code == 200
    expires_at = dt.fromisoformat(response.json()["expires_at"])
    assert expires_at == NOW + timedelta(minutes=2) + IDLE_TIMEOUT


def test_req_004_two_devices_act_as_different_members(
    unlocked: TestClient, make_client: Callable[[], TestClient], family: SeededFamily
) -> None:
    kitchen_tablet = unlocked
    laptop = make_client()
    assert unlock(laptop, family.passcode).status_code == 201

    assert act_as(kitchen_tablet, family["Mia"]).status_code == 200
    assert act_as(laptop, family["Kavi"]).status_code == 200

    assert kitchen_tablet.get(SESSION).json()["acting_member"]["id"] == str(family["Mia"].id)
    assert laptop.get(SESSION).json()["acting_member"]["id"] == str(family["Kavi"].id)
