"""Every API test also checks its server logs hold IDs only [child-data-privacy #2] (plan: Phase 3
cross-cutting). Log capture covers the whole API suite, not just the dedicated privacy tests."""

import logging
from collections.abc import Iterator

import pytest

from tests.support import (
    GOAL_NOTE,
    HABIT_TITLES,
    NEW_NICKNAMES,
    NEW_PIN,
    OTHER_MEMBERS,
    OTHER_PASSCODE,
    PASSCODE,
    PRIZE_TITLES,
    SAMPLE_MEMBERS,
    WRONG_PASSCODE,
    WRONG_PIN,
    without_ids,
)

# The test client's own request lines (httpx) are not server logs.
CLIENT_LOGGERS = ("httpx", "httpcore")

NEVER_LOGGED = (
    PASSCODE,
    OTHER_PASSCODE,
    WRONG_PASSCODE,
    WRONG_PIN,
    NEW_PIN,
    GOAL_NOTE,
    *(pin for *_, pin in SAMPLE_MEMBERS + OTHER_MEMBERS),
    *(nickname for nickname, *_ in SAMPLE_MEMBERS + OTHER_MEMBERS),
    *NEW_NICKNAMES,
    *HABIT_TITLES,
    *PRIZE_TITLES,
)


@pytest.fixture(autouse=True)
def _server_logs_hold_ids_only(caplog: pytest.LogCaptureFixture) -> Iterator[None]:
    caplog.set_level(logging.DEBUG)
    yield
    # In teardown `caplog.records` holds only teardown's records; the test ran in setup and call.
    records = caplog.get_records("setup") + caplog.get_records("call")
    server_lines = [
        without_ids(record.getMessage())
        for record in records
        if not record.name.startswith(CLIENT_LOGGERS)
    ]
    leaked = {value for value in NEVER_LOGGED for line in server_lines if value in line}
    assert not leaked, f"logs contain sensitive values: {sorted(leaked)}"
