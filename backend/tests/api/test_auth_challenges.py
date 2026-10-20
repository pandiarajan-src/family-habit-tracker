"""Which 401 is which: `WWW-Authenticate` tells the client to ask for the passcode or the PIN.

Spec §4: `FamilyPasscode` → back to Passcode entry; `MemberPIN` → the PIN pad's wrong-PIN state.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    FAMILY,
    SESSION,
    WRONG_PASSCODE,
    WRONG_PIN,
    SeededFamily,
    act_as,
    unlock,
)

ASK_PASSCODE = "FamilyPasscode"
ASK_PIN = "MemberPIN"


def _challenge(response) -> str | None:
    return response.headers.get("www-authenticate")


@pytest.mark.req("REQ-001")
def test_req_001_request_without_session_asks_for_the_passcode(client: TestClient) -> None:
    response = client.get(FAMILY)

    assert response.status_code == 401
    assert _challenge(response) == ASK_PASSCODE


@pytest.mark.req("REQ-001")
def test_req_001_wrong_passcode_asks_for_the_passcode(
    anon: TestClient, family: SeededFamily
) -> None:
    response = unlock(anon, WRONG_PASSCODE)

    assert response.status_code == 401
    assert _challenge(response) == ASK_PASSCODE


@pytest.mark.req("REQ-003")
def test_req_003_wrong_pin_asks_for_the_pin_not_the_passcode(
    unlocked: TestClient, family: SeededFamily
) -> None:
    response = act_as(unlocked, family["Mia"], pin=WRONG_PIN)

    assert response.status_code == 401
    assert _challenge(response) == ASK_PIN
    # The device is still signed in to the family; only the PIN was wrong.
    assert unlocked.get(SESSION).status_code == 200


@pytest.mark.req("REQ-004")
def test_req_004_pin_entered_after_session_ended_asks_for_the_passcode(
    unlocked: TestClient, family: SeededFamily, clock
) -> None:
    clock.advance(timedelta(minutes=5, seconds=1))

    response = act_as(unlocked, family["Mia"])

    assert response.status_code == 401
    assert _challenge(response) == ASK_PASSCODE


@pytest.mark.req("REQ-003")
def test_req_003_openapi_documents_both_challenges_on_pin_entry(client: TestClient) -> None:
    operation = client.get("/openapi.json").json()["paths"][SESSION]["patch"]

    header = operation["responses"]["401"]["headers"]["WWW-Authenticate"]
    assert set(header["schema"]["enum"]) == {ASK_PASSCODE, ASK_PIN}
