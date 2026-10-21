"""REQ-015: children can see what a parent changed, as IDs only."""

from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    ADJUSTMENTS,
    SeededFamily,
    Seeder,
    act_as,
    csrf,
    d,
    put_check_in,
    unlock,
)

pytestmark = pytest.mark.req("REQ-015")


def _list(client: TestClient, member=None):
    params = {"member_id": str(member.id)} if member is not None else {}
    return client.get(ADJUSTMENTS, params=params)


def _ack(client: TestClient, adjustment_id, body=None):
    return client.patch(
        f"{ADJUSTMENTS}/{adjustment_id}",
        json={"acknowledged": True} if body is None else body,
        headers=csrf(client),
    )


@pytest.fixture
def kavis_piano(seed: Seeder, family: SeededFamily):
    return seed.habit(family["Kavi"], "Piano")


def test_req_015_adjustments_listed_newest_first_with_ids_only(
    as_parent: TestClient, family: SeededFamily, kavis_piano, clock
) -> None:
    put_check_in(as_parent, kavis_piano, d(-14))
    clock.advance(timedelta(minutes=1))
    put_check_in(as_parent, kavis_piano, d(-6))
    act_as(as_parent, family["Kavi"])

    response = _list(as_parent)  # defaults to the acting member

    assert response.status_code == 200
    notes = response.json()
    assert [n["date"] for n in notes] == [d(-6).isoformat(), d(-14).isoformat()]
    assert set(notes[0]) == {
        "id",
        "kind",
        "actor_member_id",
        "target_member_id",
        "habit_id",
        "date",
        "acknowledged_at",
        "created_at",
    }
    assert notes[0]["actor_member_id"] == str(family["Mum"].id)
    assert notes[0]["target_member_id"] == str(family["Kavi"].id)
    assert notes[0]["habit_id"] == str(kavis_piano)
    assert notes[0]["created_at"].endswith("+01:00")


def test_req_015_stored_rows_hold_ids_not_nicknames_or_titles(
    as_parent: TestClient, family: SeededFamily, kavis_piano, seed: Seeder
) -> None:
    put_check_in(as_parent, kavis_piano, d(-3))

    columns = seed.db.connection().exec_driver_sql("SELECT * FROM adjustment").mappings().one()
    seed.db.rollback()

    assert "Piano" not in str(dict(columns))
    for nickname in family.members:
        assert nickname not in str(dict(columns))


def test_req_015_only_the_last_12_months_are_listed(
    as_parent: TestClient, family: SeededFamily, kavis_piano, clock, make_client
) -> None:
    put_check_in(as_parent, kavis_piano, d(-1))
    clock.advance(timedelta(days=366))
    device = make_client()
    unlock(device)
    act_as(device, family["Kavi"])

    assert _list(device).json() == []


def test_req_015_a_parents_own_list_is_empty(
    as_parent: TestClient, family: SeededFamily, kavis_piano
) -> None:
    put_check_in(as_parent, kavis_piano, d(-3))

    assert _list(as_parent).json() == []
    assert _list(as_parent, family["Dad"]).json() == []


def test_req_015_child_cannot_list_a_siblings_adjustments_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    assert _list(as_child, family["Kavi"]).status_code == 403


def test_req_015_list_for_an_unknown_member_returns_404(as_parent: TestClient) -> None:
    response = as_parent.get(ADJUSTMENTS, params={"member_id": str(uuid4())})

    assert response.status_code == 404


def test_req_015_target_acknowledges_got_it_returns_200(
    as_parent: TestClient, family: SeededFamily, kavis_piano, clock
) -> None:
    put_check_in(as_parent, kavis_piano, d(-3))
    act_as(as_parent, family["Kavi"])
    [note] = _list(as_parent).json()
    clock.advance(timedelta(minutes=1))

    first = _ack(as_parent, note["id"])
    again = _ack(as_parent, note["id"])

    assert first.status_code == 200
    assert first.json()["acknowledged_at"] is not None
    assert again.json()["acknowledged_at"] == first.json()["acknowledged_at"]


def test_req_015_another_member_acknowledging_returns_403(
    as_parent: TestClient, family: SeededFamily, kavis_piano
) -> None:
    put_check_in(as_parent, kavis_piano, d(-3))
    [note] = _list(as_parent, family["Kavi"]).json()

    parent = _ack(as_parent, note["id"])
    act_as(as_parent, family["Mia"])
    sibling = _ack(as_parent, note["id"])

    assert (parent.status_code, sibling.status_code) == (403, 403)


def test_req_015_acknowledging_an_unknown_adjustment_returns_404(as_child: TestClient) -> None:
    assert _ack(as_child, uuid4()).status_code == 404


@pytest.mark.parametrize("body", [{"acknowledged": False}, {}, {"acknowledged": True, "x": 1}])
def test_req_015_acknowledge_body_must_be_true_returns_422(
    as_parent: TestClient, family: SeededFamily, kavis_piano, body: dict
) -> None:
    put_check_in(as_parent, kavis_piano, d(-3))
    act_as(as_parent, family["Kavi"])
    [note] = _list(as_parent).json()

    assert _ack(as_parent, note["id"], body).status_code == 422
