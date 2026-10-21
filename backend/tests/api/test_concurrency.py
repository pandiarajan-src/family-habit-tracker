"""REQ-012 and REQ-020: two devices at once, on a file database with real threads.

These assert the end state (one row, a consistent balance), not the timing (plan: Phase 3 risk).
"""

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from tests.support import (
    Person,
    SeededFamily,
    Seeder,
    act_as,
    balance,
    d,
    delete_check_in,
    habit_path,
    put_check_in,
    unlock,
    use_saver,
)

ROUNDS = 5


def _device(make_client: Callable[[], TestClient], person: Person) -> TestClient:
    device = make_client()
    assert unlock(device).status_code == 201
    assert act_as(device, person).status_code == 200
    return device


def _at_once(*calls: Callable[[], Response]) -> list[Response]:
    """Start every call at the same moment, each on its own thread."""
    start = Barrier(len(calls))

    def run(call: Callable[[], Response]) -> Response:
        start.wait()
        return call()

    with ThreadPoolExecutor(len(calls)) as pool:
        return list(pool.map(run, calls))


@pytest.mark.req("REQ-012")
def test_req_012_two_concurrent_puts_make_one_check_in(
    make_client: Callable[[], TestClient], family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    tablet, laptop = _device(make_client, mia), _device(make_client, family["Mum"])
    habits = [seed.habit(mia, "Reading") for _ in range(ROUNDS)]

    for habit in habits:
        first, second = _at_once(
            lambda h=habit: put_check_in(tablet, h), lambda h=habit: put_check_in(laptop, h)
        )

        assert sorted([first.status_code, second.status_code]) == [200, 201]
        assert first.json()["id"] == second.json()["id"]
        assert seed.count("check_in", "habit_id = ?", habit.hex) == 1
    assert balance(tablet, mia) == ROUNDS


@pytest.mark.req("REQ-012")
def test_req_012_different_members_check_in_at_once_and_both_are_saved(
    make_client: Callable[[], TestClient], family: SeededFamily, seed: Seeder
) -> None:
    mia, kavi = family["Mia"], family["Kavi"]
    mias, kavis = seed.habit(mia, "Reading"), seed.habit(kavi, "Piano")
    tablet, laptop = _device(make_client, mia), _device(make_client, kavi)

    responses = _at_once(lambda: put_check_in(tablet, mias), lambda: put_check_in(laptop, kavis))

    assert [r.status_code for r in responses] == [201, 201]
    assert [r.json()["created_by_member_id"] for r in responses] == [str(mia.id), str(kavi.id)]


@pytest.mark.req("REQ-012")
def test_req_012_racing_put_and_delete_leave_a_balance_matching_the_final_state(
    make_client: Callable[[], TestClient], family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    tablet, laptop = _device(make_client, mia), _device(make_client, mia)
    habit = seed.habit(mia, "Reading")

    for _ in range(ROUNDS):
        put, undo = _at_once(
            lambda: put_check_in(tablet, habit), lambda: delete_check_in(laptop, habit)
        )

        assert put.status_code in (200, 201)
        assert undo.status_code == 204
        done = tablet.get(habit_path(habit)).json()["today_done"]
        assert seed.count("check_in", "habit_id = ?", habit.hex) == int(done)
        assert balance(tablet, mia) == int(done)


@pytest.mark.req("REQ-020")
def test_req_020_two_concurrent_saver_spends_cannot_overspend(
    make_client: Callable[[], TestClient], family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    # Two habits, each with a saveable day costing 1; Mia has 2 gems, spends 1, so 1 is left.
    habits = [seed.habit(mia, title, done=[d(-3)]) for title in ("Reading", "Piano")]
    seed.spend(mia, 1)
    tablet, laptop = _device(make_client, mia), _device(make_client, family["Mum"])
    assert balance(tablet, mia) == 1

    responses = _at_once(
        lambda: use_saver(tablet, habits[0], d(-2)), lambda: use_saver(laptop, habits[1], d(-2))
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    assert balance(tablet, mia) == 0
    assert seed.count("streak_saver", "member_id = ?", mia.id.hex) == 1
