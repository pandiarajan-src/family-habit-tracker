"""Spec §6 security NFRs: response headers and CSRF (double-submit cookie)."""

import pytest
from fastapi.testclient import TestClient

from tests.support import FAMILY, FAMILY_TZ, SeededFamily, set_timezone, unlock


@pytest.mark.parametrize("path", ["/api/v1/health", "/api/v1/sessions/current"])
def test_nfr_responses_carry_csp_hsts_and_nosniff(client: TestClient, path: str) -> None:
    response = client.get(path)

    assert "default-src 'self'" in response.headers.get("content-security-policy", "")
    assert "max-age=" in response.headers.get("strict-transport-security", "")
    assert response.headers.get("x-content-type-options") == "nosniff"


def test_nfr_write_without_csrf_token_returns_403(as_parent: TestClient) -> None:
    response = as_parent.patch(FAMILY, json={"timezone": "Asia/Kolkata"})

    assert response.status_code == 403
    assert as_parent.get(FAMILY).json()["timezone"] == FAMILY_TZ


def test_nfr_write_with_mismatched_csrf_token_returns_403(as_parent: TestClient) -> None:
    response = as_parent.patch(
        FAMILY, json={"timezone": "Asia/Kolkata"}, headers={"X-CSRF-Token": "not-the-token"}
    )

    assert response.status_code == 403
    assert as_parent.get(FAMILY).json()["timezone"] == FAMILY_TZ


def test_nfr_write_with_matching_csrf_token_succeeds(as_parent: TestClient) -> None:
    assert set_timezone(as_parent, "Asia/Kolkata").status_code == 200


def test_nfr_passcode_entry_sets_csrf_cookie_readable_by_the_app(
    anon: TestClient, family: SeededFamily
) -> None:
    response = unlock(anon, family.passcode)

    [csrf_cookie] = [
        header
        for header in response.headers.get_list("set-cookie")
        if header.startswith("csrf_token=")
    ]
    assert "httponly" not in csrf_cookie.lower()
    assert anon.cookies.get("csrf_token")
