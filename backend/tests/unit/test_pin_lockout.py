"""REQ-003 (unit): the per-member PIN lockout counter."""

from datetime import timedelta
from uuid import uuid4

import pytest

from app.models import MemberCredential
from app.security.pin_lockout import PIN_LOCKOUT, is_locked, record_failure, record_success
from tests.support import NOW

pytestmark = pytest.mark.req("REQ-003")


def _credential() -> MemberCredential:
    return MemberCredential(member_id=uuid4(), pin_hash="x", failed_attempts=0)


def test_req_003_four_wrong_pins_do_not_lock() -> None:
    credential = _credential()
    for _ in range(4):
        record_failure(credential, NOW)

    assert credential.failed_attempts == 4
    assert not is_locked(credential, NOW)


def test_req_003_fifth_wrong_pin_locks_for_5_minutes_and_restarts_the_count() -> None:
    credential = _credential()
    for _ in range(5):
        record_failure(credential, NOW)

    assert credential.locked_until == NOW + PIN_LOCKOUT
    assert credential.failed_attempts == 0
    assert is_locked(credential, NOW + PIN_LOCKOUT - timedelta(seconds=1))
    assert not is_locked(credential, NOW + PIN_LOCKOUT)


def test_req_003_correct_pin_clears_the_count_and_any_lock() -> None:
    credential = _credential()
    for _ in range(3):
        record_failure(credential, NOW)
    credential.locked_until = NOW

    record_success(credential)

    assert credential.failed_attempts == 0
    assert credential.locked_until is None
