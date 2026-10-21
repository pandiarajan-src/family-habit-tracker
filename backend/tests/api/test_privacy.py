"""Child-data privacy: minimal member fields [#1] and ID-only logs [#2]."""

import logging
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    MEMBER_READ_FIELDS,
    MEMBERS,
    NEW_PIN,
    SESSION,
    WRONG_PASSCODE,
    WRONG_PIN,
    SeededFamily,
    act_as,
    csrf,
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


def test_privacy_members_list_exposes_only_allowed_fields(unlocked: TestClient) -> None:
    members = unlocked.get(MEMBERS).json()

    assert members
    assert all(set(member) == MEMBER_READ_FIELDS for member in members)


def test_privacy_invalid_pins_are_not_echoed_in_422_bodies(
    as_parent: TestClient, family: SeededFamily
) -> None:
    bad_pin = "98x7"
    created = as_parent.post(
        MEMBERS,
        json={"nickname": "Zuzu", "avatar_emoji": "🦊", "role": "child", "pin": bad_pin},
        headers=csrf(as_parent),
    )
    reset = as_parent.put(
        f"{MEMBERS}/{family['Kavi'].id}/credentials", json={"pin": bad_pin}, headers=csrf(as_parent)
    )

    for response in (created, reset):
        assert response.status_code == 422
        assert bad_pin not in response.text
        assert "Zuzu" not in response.text


def test_privacy_member_creation_and_pin_reset_log_ids_only(
    as_parent: TestClient, family: SeededFamily, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    as_parent.post(
        MEMBERS,
        json={"nickname": "Zuzu", "avatar_emoji": "🦊", "role": "child", "pin": NEW_PIN},
        headers=csrf(as_parent),
    )
    as_parent.put(
        f"{MEMBERS}/{family['Kavi'].id}/credentials", json={"pin": NEW_PIN}, headers=csrf(as_parent)
    )

    app_lines = [r.getMessage() for r in caplog.records if r.name.startswith("app.")]
    assert any("member created" in line for line in app_lines)
    assert any("pin changed" in line for line in app_lines)
    logged = without_ids(caplog.text)
    assert "Zuzu" not in logged
    assert NEW_PIN not in logged
