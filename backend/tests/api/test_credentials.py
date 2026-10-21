"""REQ-005: set your own PIN, or reset a child's PIN as a parent."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    ADJUSTMENTS,
    MEMBERS,
    NEW_PIN,
    WRONG_PIN,
    Person,
    SeededFamily,
    act_as,
    csrf,
    switch_person,
)

pytestmark = pytest.mark.req("REQ-005")


def _set_pin(client: TestClient, person: Person, **body) -> object:
    return client.put(f"{MEMBERS}/{person.id}/credentials", json=body, headers=csrf(client))


def test_req_005_member_sets_own_pin_with_current_pin_returns_204(
    as_child: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]

    response = _set_pin(as_child, mia, pin=NEW_PIN, current_pin=mia.pin)

    assert response.status_code == 204
    assert response.content == b""
    switch_person(as_child)
    assert act_as(as_child, mia).status_code == 401  # the old PIN no longer works
    assert act_as(as_child, mia, pin=NEW_PIN).status_code == 200


def test_req_005_missing_current_pin_returns_422(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = _set_pin(as_child, family["Mia"], pin=NEW_PIN)

    assert response.status_code == 422
    assert "current_pin" in response.json()["detail"]


def test_req_005_wrong_current_pin_returns_401_member_pin(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = _set_pin(as_child, family["Mia"], pin=NEW_PIN, current_pin=WRONG_PIN)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "MemberPIN"


def test_req_005_five_wrong_current_pins_lock_then_return_429(
    as_child: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]
    for _ in range(5):
        assert _set_pin(as_child, mia, pin=NEW_PIN, current_pin=WRONG_PIN).status_code == 401

    response = _set_pin(as_child, mia, pin=NEW_PIN, current_pin=mia.pin)

    assert response.status_code == 429
    switch_person(as_child)
    assert act_as(as_child, mia).status_code == 429  # the same lockout as the PIN pad


def test_req_005_parent_resets_child_pin_without_current_pin_and_clears_lockout(
    as_parent: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]
    for _ in range(5):
        act_as(as_parent, mia, pin=WRONG_PIN)
    act_as(as_parent, family["Mum"])

    response = _set_pin(as_parent, mia, pin=NEW_PIN)

    assert response.status_code == 204
    notes = as_parent.get(ADJUSTMENTS, params={"member_id": str(mia.id)}).json()
    assert [(n["kind"], n["actor_member_id"]) for n in notes] == [
        ("pin_reset", str(family["Mum"].id))
    ]
    assert act_as(as_parent, mia, pin=NEW_PIN).status_code == 200


def test_req_005_child_cannot_set_another_members_pin_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = _set_pin(as_child, family["Kavi"], pin=NEW_PIN, current_pin=family["Kavi"].pin)

    assert response.status_code == 403


def test_req_005_parent_cannot_reset_the_other_parents_pin_returns_403(
    as_parent: TestClient, family: SeededFamily
) -> None:
    response = _set_pin(as_parent, family["Dad"], pin=NEW_PIN)

    assert response.status_code == 403


@pytest.mark.parametrize("pin", ["12a4", "123", "12345", ""])
def test_req_005_pin_not_exactly_4_digits_returns_422(
    as_child: TestClient, family: SeededFamily, pin: str
) -> None:
    response = _set_pin(as_child, family["Mia"], pin=pin, current_pin=family["Mia"].pin)

    assert response.status_code == 422


def test_req_005_unknown_member_returns_404(as_parent: TestClient) -> None:
    response = as_parent.put(
        f"{MEMBERS}/{uuid4()}/credentials", json={"pin": NEW_PIN}, headers=csrf(as_parent)
    )

    assert response.status_code == 404


def test_req_005_member_without_a_pin_record_gets_401_for_own_change(
    as_child: TestClient, family: SeededFamily, db
) -> None:
    from app.models import MemberCredential

    db.delete(db.get_one(MemberCredential, family["Mia"].id))
    db.commit()

    response = _set_pin(as_child, family["Mia"], pin=NEW_PIN, current_pin=family["Mia"].pin)

    assert response.status_code == 401


def test_req_005_parent_reset_creates_a_missing_pin_record(
    as_parent: TestClient, family: SeededFamily, db
) -> None:
    from app.models import MemberCredential

    db.delete(db.get_one(MemberCredential, family["Kavi"].id))
    db.commit()

    assert _set_pin(as_parent, family["Kavi"], pin=NEW_PIN).status_code == 204
    assert act_as(as_parent, family["Kavi"], pin=NEW_PIN).status_code == 200
