"""REQ-001 (unit): the passcode limiter's 15-minute sliding window."""

from datetime import timedelta

import pytest

from app.security.rate_limit import FailureWindow
from tests.support import NOW

pytestmark = pytest.mark.req("REQ-001")

WINDOW = timedelta(minutes=15)


def _limiter() -> FailureWindow:
    return FailureWindow(max_failures=10, window=WINDOW)


def test_req_001_nine_failures_do_not_block_and_the_tenth_does() -> None:
    limiter = _limiter()
    for _ in range(9):
        limiter.record_failure("tablet", NOW)
    assert not limiter.is_blocked("tablet", NOW)

    limiter.record_failure("tablet", NOW)

    assert limiter.is_blocked("tablet", NOW)


def test_req_001_each_client_has_its_own_window() -> None:
    limiter = _limiter()
    for _ in range(10):
        limiter.record_failure("tablet", NOW)

    assert not limiter.is_blocked("laptop", NOW)


def test_req_001_window_slides_so_old_failures_stop_counting() -> None:
    limiter = _limiter()
    for minute in range(10):  # one failure a minute, at 0..9
        limiter.record_failure("tablet", NOW + timedelta(minutes=minute))

    assert limiter.is_blocked("tablet", NOW + WINDOW - timedelta(seconds=1))
    # At 15:00 the first failure is exactly 15 minutes old and drops out: 9 left.
    assert not limiter.is_blocked("tablet", NOW + WINDOW)
