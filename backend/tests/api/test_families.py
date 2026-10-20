"""REQ-027: the family timezone defines days and weeks."""

from datetime import datetime as dt
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from tests.support import FAMILY, FAMILY_TZ, NOW, SESSION, SeededFamily, csrf, set_timezone

pytestmark = pytest.mark.req("REQ-027")


def test_req_027_get_family_returns_id_and_timezone_only(
    unlocked: TestClient, family: SeededFamily
) -> None:
    response = unlocked.get(FAMILY)

    assert response.status_code == 200
    assert response.json() == {"id": str(family.id), "timezone": FAMILY_TZ}


def test_req_027_parent_changes_timezone(as_parent: TestClient) -> None:
    response = set_timezone(as_parent, "Asia/Kolkata")

    assert response.status_code == 200
    assert response.json()["timezone"] == "Asia/Kolkata"
    assert as_parent.get(FAMILY).json()["timezone"] == "Asia/Kolkata"


@pytest.mark.parametrize("timezone", ["Mars/Olympus_Mons", "europe london", ""])
def test_req_027_invalid_timezone_returns_422_and_keeps_old_one(
    as_parent: TestClient, timezone: str
) -> None:
    response = set_timezone(as_parent, timezone)

    assert response.status_code == 422
    assert "detail" in response.json()
    assert as_parent.get(FAMILY).json()["timezone"] == FAMILY_TZ


def test_req_027_child_cannot_change_timezone_returns_403(as_child: TestClient) -> None:
    response = set_timezone(as_child, "Asia/Kolkata")

    assert response.status_code == 403
    assert as_child.get(FAMILY).json()["timezone"] == FAMILY_TZ


def test_req_027_datetimes_carry_family_offset(as_parent: TestClient) -> None:
    london = dt.fromisoformat(as_parent.get(SESSION).json()["expires_at"])
    # 20 Oct 2026 is still British Summer Time.
    assert london.utcoffset() == timedelta(hours=1)
    assert london == NOW + timedelta(minutes=5)

    assert set_timezone(as_parent, "Asia/Kolkata").status_code == 200
    kolkata = dt.fromisoformat(as_parent.get(SESSION).json()["expires_at"])

    assert kolkata.utcoffset() == timedelta(hours=5, minutes=30)
    assert kolkata == NOW + timedelta(minutes=5)


def test_req_027_extra_field_returns_422(as_parent: TestClient) -> None:
    response = as_parent.patch(
        FAMILY,
        json={"timezone": "Asia/Kolkata", "passcode_hash": "x"},
        headers=csrf(as_parent),
    )

    assert response.status_code == 422
    assert as_parent.get(FAMILY).json()["timezone"] == FAMILY_TZ
