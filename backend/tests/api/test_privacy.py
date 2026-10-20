"""Child-data privacy: minimal member fields [#1] and ID-only logs [#2]."""

import logging
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    MEMBER_READ_FIELDS,
    SESSION,
    WRONG_PASSCODE,
    WRONG_PIN,
    SeededFamily,
    act_as,
    unlock,
    without_ids,
)


def test_privacy_member_read_exposes_only_allowed_fields(as_child: TestClient) -> None:
    acting = as_child.get(SESSION).json()["acting_member"]

    assert set(acting) == MEMBER_READ_FIELDS


def test_privacy_access_flow_logs_contain_no_passcode_pin_or_nickname(
    make_client: Callable[[], TestClient],
    family: SeededFamily,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    device = make_client()

    unlock(device, WRONG_PASSCODE)
    unlock(device, family.passcode)
    act_as(device, family["Kavi"], pin=WRONG_PIN)
    act_as(device, family["Kavi"])

    logged = without_ids(caplog.text)
    for secret in (family.passcode, WRONG_PASSCODE, WRONG_PIN, family["Kavi"].pin):
        assert secret not in logged
    for nickname in family.members:
        assert nickname not in logged
