"""REQ-002: a parent signs a device out of the family."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.support import FAMILY, SESSION, csrf

pytestmark = pytest.mark.req("REQ-002")


def test_req_002_parent_signs_device_out_returns_204(as_parent: TestClient) -> None:
    response = as_parent.delete(SESSION, headers=csrf(as_parent))

    assert response.status_code == 204
    assert response.content == b""
    assert as_parent.get(FAMILY).status_code == 401


def test_req_002_replayed_signed_out_cookie_returns_401(
    as_parent: TestClient, make_client: Callable[[], TestClient]
) -> None:
    stolen = dict(as_parent.cookies)
    assert as_parent.delete(SESSION, headers=csrf(as_parent)).status_code == 204

    replay = make_client()
    replay.cookies.update(stolen)

    assert replay.get(FAMILY).status_code == 401
    assert replay.get(SESSION).status_code == 401


def test_req_002_child_cannot_sign_device_out_returns_403(as_child: TestClient) -> None:
    response = as_child.delete(SESSION, headers=csrf(as_child))

    assert response.status_code == 403
    assert "detail" in response.json()
    assert as_child.get(FAMILY).status_code == 200


def test_req_002_sign_out_without_acting_member_returns_403(unlocked: TestClient) -> None:
    response = unlocked.delete(SESSION, headers=csrf(unlocked))

    assert response.status_code == 403
    assert unlocked.get(FAMILY).status_code == 200
