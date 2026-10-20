"""REQ-004 (unit): idle timeouts for the family session and the acting member."""

from datetime import timedelta
from uuid import uuid4

import pytest

from app.models import DeviceSession
from app.security.sessions import IDLE_TIMEOUT, apply_activity, is_expired
from tests.support import NOW

pytestmark = pytest.mark.req("REQ-004")

MUM = uuid4()


def _session(*, acting: bool = True) -> DeviceSession:
    return DeviceSession(
        id="x" * 64,
        family_id=uuid4(),
        acting_member_id=MUM if acting else None,
        last_activity_at=NOW,
        acting_member_last_activity_at=NOW if acting else None,
        expires_at=NOW + IDLE_TIMEOUT,
    )


def test_req_004_session_ends_exactly_5_minutes_after_last_activity() -> None:
    row = _session()

    assert not is_expired(row, NOW + IDLE_TIMEOUT - timedelta(seconds=1))
    assert is_expired(row, NOW + IDLE_TIMEOUT)


def test_req_004_person_initiated_request_extends_session_and_acting_member() -> None:
    row = _session()
    later = NOW + timedelta(minutes=4)

    apply_activity(row, later, person_initiated=True)

    assert row.expires_at == later + IDLE_TIMEOUT
    assert row.last_activity_at == later
    assert row.acting_member_last_activity_at == later
    assert row.acting_member_id == MUM


def test_req_004_background_refresh_extends_nothing() -> None:
    row = _session()

    apply_activity(row, NOW + timedelta(minutes=4), person_initiated=False)

    assert row.expires_at == NOW + IDLE_TIMEOUT
    assert row.last_activity_at == NOW
    assert row.acting_member_last_activity_at == NOW


def test_req_004_acting_member_is_cleared_after_5_idle_minutes() -> None:
    row = _session()

    apply_activity(row, NOW + IDLE_TIMEOUT, person_initiated=True)

    assert row.acting_member_id is None
    assert row.acting_member_last_activity_at is None


def test_req_004_acting_member_is_kept_just_before_5_idle_minutes() -> None:
    row = _session()

    apply_activity(row, NOW + IDLE_TIMEOUT - timedelta(seconds=1), person_initiated=False)

    assert row.acting_member_id == MUM


def test_req_004_activity_without_acting_member_sets_no_member_timestamp() -> None:
    row = _session(acting=False)

    apply_activity(row, NOW + timedelta(minutes=1), person_initiated=True)

    assert row.acting_member_last_activity_at is None
