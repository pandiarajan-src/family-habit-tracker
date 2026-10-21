"""REQ-020: spend gems on a streak saver so a past day (or last week) keeps the streak going."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    ADJUSTMENTS,
    TODAY,
    SeededFamily,
    Seeder,
    balance,
    csrf,
    d,
    habit_path,
    use_saver,
)

pytestmark = pytest.mark.req("REQ-020")

FIVE_DAYS = [d(-9), d(-8), d(-7), d(-6), d(-5)]  # a run of 5: 5 gems + the 5-day bonus


def test_req_020_first_saver_costs_1_and_second_in_the_run_costs_2(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=FIVE_DAYS)
    assert balance(as_child, mia) == 10

    first = use_saver(as_child, habit, d(-4))
    second = use_saver(as_child, habit, d(-3))

    assert (first.status_code, second.status_code) == (201, 201)
    assert first.json()["cost"] == 1
    assert second.json()["cost"] == 2
    assert first.json()["period_start"] == d(-4).isoformat()
    assert first.json()["member_id"] == str(mia.id)
    assert first.json()["created_at"].endswith("+01:00")
    assert balance(as_child, mia) == 10 - 3
    body = as_child.get(habit_path(habit)).json()
    assert body["current_streak"] == 0  # the run ended at d-3; yesterday is open
    assert body["best_streak"] == 5  # saved days bridge but don't count
    assert body["saveable_periods"] == [{"period_start": d(-2).isoformat(), "cost": 3}]


def test_req_020_not_enough_gems_returns_409_and_changes_nothing(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-3)])
    seed.spend(mia, 1)

    response = use_saver(as_child, habit, d(-2))

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail.startswith("You need 1 gem for this saver")
    assert not {"missed", "failed", "bad"} & set(detail.lower().split())
    assert balance(as_child, mia) == 0
    assert seed.count("streak_saver") == 0


@pytest.mark.parametrize(
    ("done", "day"),
    [
        ([d(-1)], TODAY),  # today can't be saved
        ([d(-10), d(-9)], d(-8)),  # more than 7 days ago
        ([d(-5)], d(-3)),  # doesn't directly follow a done or saved day
    ],
    ids=["today", "8 days back", "after a gap"],
)
def test_req_020_unsaveable_day_returns_422_and_spends_nothing(
    as_child: TestClient, family: SeededFamily, seed: Seeder, done: list, day
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=done)
    before = balance(as_child, mia)

    response = use_saver(as_child, habit, day)

    assert response.status_code == 422
    assert balance(as_child, mia) == before
    assert seed.count("streak_saver") == 0


def test_req_020_saving_the_same_day_twice_returns_422(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=FIVE_DAYS)
    use_saver(as_child, habit, d(-4))

    assert use_saver(as_child, habit, d(-4)).status_code == 422
    assert seed.count("streak_saver") == 1


def test_req_020_weekly_habit_saves_last_week_when_it_ended_below_target(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    two_weeks_ago, last_week = d(-15), d(-8)  # Mondays
    done = [two_weeks_ago, d(-14), d(-13), last_week]  # 3 of 3, then 1 of 3
    habit = seed.habit(mia, "Piano", frequency="weekly", target=3, done=done)
    assert as_child.get(habit_path(habit)).json()["next_saver_cost"] == 1

    wrong_week = use_saver(as_child, habit, two_weeks_ago)
    not_a_monday = use_saver(as_child, habit, d(-7))
    response = use_saver(as_child, habit, last_week)

    assert (wrong_week.status_code, not_a_monday.status_code) == (422, 422)
    assert response.status_code == 201
    assert response.json()["cost"] == 1
    assert balance(as_child, mia) == 0
    assert as_child.get(habit_path(habit)).json()["current_streak"] == 1


def test_req_020_parent_saves_for_a_child_spends_the_childs_gems_with_an_adjustment(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", done=FIVE_DAYS)

    response = use_saver(as_parent, habit, d(-4))

    assert response.status_code == 201
    assert balance(as_parent, kavi) == 9
    assert balance(as_parent, family["Mum"]) == 0
    notes = as_parent.get(ADJUSTMENTS, params={"member_id": str(kavi.id)}).json()
    assert [(n["kind"], n["date"]) for n in notes] == [("streak_saver_used", d(-4).isoformat())]


def test_req_020_child_cannot_save_a_siblings_streak_returns_403(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano", done=FIVE_DAYS)

    assert use_saver(as_child, habit, d(-4)).status_code == 403


def test_req_020_parent_cannot_save_the_other_parents_streak_returns_403(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Dad"], "Swimming", done=FIVE_DAYS)

    assert use_saver(as_parent, habit, d(-4)).status_code == 403


def test_req_020_archived_habit_returns_422(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=FIVE_DAYS)
    as_child.patch(habit_path(habit), json={"archived": True}, headers=csrf(as_child))

    assert use_saver(as_child, habit, d(-4)).status_code == 422


def test_req_020_unknown_habit_returns_404(as_child: TestClient) -> None:
    assert use_saver(as_child, uuid4(), d(-1)).status_code == 404


def test_req_020_extra_field_returns_422(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=FIVE_DAYS)

    response = as_child.post(
        f"{habit_path(habit)}/streak-savers",
        json={"period_start": d(-4).isoformat(), "cost": 0},
        headers=csrf(as_child),
    )

    assert response.status_code == 422
