"""REQ-028 (Phase 1 scaffold): every request is scoped to the session's family."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.support import FAMILY, SESSION, SeededFamily, act_as, unlock

pytestmark = pytest.mark.req("REQ-028")


def test_req_028_member_id_from_another_family_returns_404(
    unlocked: TestClient, other_family: SeededFamily
) -> None:
    response = act_as(unlocked, other_family["Gran"])

    assert response.status_code == 404
    assert unlocked.get(SESSION).json()["acting_member"] is None


def test_req_028_session_only_sees_its_own_family(
    make_client: Callable[[], TestClient], family: SeededFamily, other_family: SeededFamily
) -> None:
    device = make_client()

    assert unlock(device, other_family.passcode).status_code == 201

    assert device.get(FAMILY).json()["id"] == str(other_family.id)
    assert device.get(SESSION).json()["family_id"] == str(other_family.id)
