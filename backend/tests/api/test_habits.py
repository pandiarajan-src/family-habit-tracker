"""REQ-008 create habits, REQ-009 edit/archive/delete, REQ-010 parents and children's habits,
and the derived HabitRead fields: REQ-016/017 streaks, REQ-020 saveable periods, REQ-022."""

from collections.abc import Callable
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    ADJUSTMENTS,
    GOAL_NOTE,
    HABITS,
    TODAY,
    SeededFamily,
    Seeder,
    act_as,
    balance,
    create_habit,
    csrf,
    d,
    habit_path,
    put_check_in,
    unlock,
)


def _patch(client: TestClient, habit_id, **body):
    return client.patch(habit_path(habit_id), json=body, headers=csrf(client))


def _notes(client: TestClient, member) -> list[str]:
    response = client.get(ADJUSTMENTS, params={"member_id": str(member.id)})
    return [n["kind"] for n in response.json()]


# ---- REQ-008: create ---------------------------------------------------------------------


@pytest.mark.req("REQ-008")
def test_req_008_create_daily_habit_returns_201_and_shows_from_today(
    as_child: TestClient, family: SeededFamily
) -> None:
    mia = family["Mia"]

    response = create_habit(as_child, mia, "Reading", goal_note=GOAL_NOTE)

    assert response.status_code == 201
    body = response.json()
    assert body["member_id"] == str(mia.id)
    assert body["title"] == "Reading"
    assert body["goal_note"] == GOAL_NOTE
    assert body["frequency"] == "daily"
    assert body["weekly_target"] is None
    assert body["target_history"] == []
    assert body["week_progress"] is None
    assert body["created_on"] == TODAY.isoformat()
    assert body["archived"] is False
    assert body["archived_on"] is None
    listed = as_child.get(HABITS, params={"member_id": str(mia.id)}).json()
    assert [h["id"] for h in listed] == [body["id"]]


@pytest.mark.req("REQ-008")
def test_req_008_create_weekly_habit_with_target_returns_201(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = create_habit(as_child, family["Mia"], "Piano", "weekly", weekly_target=3)

    assert response.status_code == 201
    assert response.json()["weekly_target"] == 3
    assert response.json()["week_progress"] == {"done": 0, "target": 3, "complete": False}


@pytest.mark.req("REQ-008")
@pytest.mark.parametrize(
    ("frequency", "target"), [("weekly", None), ("weekly", 0), ("weekly", 8), ("daily", 3)]
)
def test_req_008_weekly_target_rules_return_422(
    as_child: TestClient, family: SeededFamily, frequency: str, target: int | None
) -> None:
    response = create_habit(as_child, family["Mia"], "Piano", frequency, weekly_target=target)

    assert response.status_code == 422
    assert as_child.get(HABITS).json() == []


@pytest.mark.req("REQ-008")
@pytest.mark.parametrize(
    "fields",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 41},
        {"goal_note": "x" * 61},
        {"frequency": "monthly"},
        {"colour": "red"},
    ],
)
def test_req_008_invalid_habit_returns_422(
    as_child: TestClient, family: SeededFamily, fields: dict
) -> None:
    body = {"member_id": str(family["Mia"].id), "title": "Reading", "frequency": "daily"}

    response = as_child.post(HABITS, json=body | fields, headers=csrf(as_child))

    assert response.status_code == 422


@pytest.mark.req("REQ-008")
def test_req_008_title_at_40_and_note_at_60_characters_are_accepted(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = create_habit(as_child, family["Mia"], "R" * 40, goal_note="n" * 60)

    assert response.status_code == 201


@pytest.mark.req("REQ-008")
def test_req_008_twenty_first_active_habit_returns_422(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    first = seed.habit(mia)
    for _ in range(19):
        seed.habit(mia)

    response = create_habit(as_child, mia)

    assert response.status_code == 422
    assert "20" in response.json()["detail"]
    # An archived habit doesn't count toward the limit.
    assert _patch(as_child, first, archived=True).status_code == 200
    assert create_habit(as_child, mia).status_code == 201


@pytest.mark.req("REQ-008")
def test_req_008_child_cannot_create_a_habit_for_another_member_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = create_habit(as_child, family["Kavi"])

    assert response.status_code == 403
    assert as_child.get(HABITS).json() == []


@pytest.mark.req("REQ-008")
def test_req_008_habit_for_an_unknown_member_returns_404(as_parent: TestClient) -> None:
    body = {"member_id": str(uuid4()), "title": "Reading", "frequency": "daily"}

    response = as_parent.post(HABITS, json=body, headers=csrf(as_parent))

    assert response.status_code == 404


# ---- REQ-009: edit, archive, delete ------------------------------------------------------


@pytest.mark.req("REQ-009")
def test_req_009_rename_and_new_goal_keep_streak_and_gems(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-3), d(-2), d(-1)])
    before = as_child.get(habit_path(habit)).json()
    gems_before = balance(as_child, mia)

    response = _patch(as_child, habit, title="Swimming", goal_note=GOAL_NOTE)

    assert response.status_code == 200
    after = response.json()
    assert (after["title"], after["goal_note"]) == ("Swimming", GOAL_NOTE)
    assert after["current_streak"] == before["current_streak"] == 3
    assert after["best_streak"] == before["best_streak"]
    assert balance(as_child, mia) == gems_before == 3


@pytest.mark.req("REQ-009")
def test_req_009_goal_note_null_clears_it_and_unsent_keeps_it(
    as_child: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_child, family["Mia"], goal_note=GOAL_NOTE).json()["id"]

    assert _patch(as_child, habit, title="Swimming").json()["goal_note"] == GOAL_NOTE
    assert _patch(as_child, habit, goal_note=None).json()["goal_note"] is None


@pytest.mark.req("REQ-009")
def test_req_009_new_weekly_target_applies_from_this_week_only(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    # Three past weeks with 3 check-ins each; the target was 3.
    done = [d(-7 * w + i) for w in (1, 2, 3) for i in (-1, 0, 1)]
    habit = seed.habit(mia, "Piano", frequency="weekly", target=3, done=done)
    assert as_child.get(habit_path(habit)).json()["best_streak"] == 3

    response = _patch(as_child, habit, weekly_target=5)

    assert response.status_code == 200
    assert response.json()["weekly_target"] == 5
    assert response.json()["week_progress"]["target"] == 5
    assert response.json()["best_streak"] == 3  # past weeks keep the target they had


@pytest.mark.req("REQ-017")
def test_req_017_target_history_lists_each_target_with_its_first_week(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    # History needs the target each past week had, not only this week's (REQ-017, REQ-023).
    created = d(-21)
    habit = seed.habit(family["Mia"], "Piano", frequency="weekly", target=3, created_on=created)

    response = _patch(as_child, habit, weekly_target=5)

    assert response.json()["target_history"] == [
        {
            "effective_from_week": (created - timedelta(days=created.weekday())).isoformat(),
            "target": 3,
        },
        {"effective_from_week": (TODAY - timedelta(days=TODAY.weekday())).isoformat(), "target": 5},
    ]


@pytest.mark.req("REQ-009")
def test_req_009_second_target_change_in_a_week_replaces_the_first(
    as_child: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_child, family["Mia"], "Piano", "weekly", weekly_target=3).json()["id"]

    _patch(as_child, habit, weekly_target=5)
    response = _patch(as_child, habit, weekly_target=2)

    assert response.json()["weekly_target"] == 2


@pytest.mark.req("REQ-009")
def test_req_009_weekly_target_on_a_daily_habit_returns_422(
    as_child: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_child, family["Mia"]).json()["id"]

    assert _patch(as_child, habit, weekly_target=3).status_code == 422


@pytest.mark.req("REQ-009")
def test_req_009_archive_hides_from_today_list_and_keeps_history(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-2), d(-1)])

    response = _patch(as_child, habit, archived=True)

    assert response.status_code == 200
    assert response.json()["archived"] is True
    assert as_child.get(HABITS).json() == []
    archived = as_child.get(HABITS, params={"include_archived": True}).json()
    assert [h["id"] for h in archived] == [str(habit)]
    history = as_child.get("/api/v1/check-ins", params={"from": d(-7), "to": d(0)}).json()
    assert len(history) == 2


@pytest.mark.req("REQ-009")
def test_req_009_archived_streak_is_frozen_as_time_passes(
    make_client: Callable[[], TestClient], family: SeededFamily, seed: Seeder, clock
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-3), d(-2), d(-1)])
    device = make_client()
    unlock(device)
    act_as(device, mia)
    _patch(device, habit, archived=True)

    clock.advance(timedelta(days=5))
    unlock(device)

    frozen = device.get(habit_path(habit)).json()
    assert frozen["current_streak"] == 3
    assert frozen["archived_on"] == TODAY.isoformat()  # History shows no state after it
    assert frozen["saveable_periods"] == []
    act_as(device, mia)
    # An archived habit can't be checked in until it is brought back.
    assert put_check_in(device, habit, TODAY + timedelta(days=5)).status_code == 422


@pytest.mark.req("REQ-009")
def test_req_009_unarchive_restarts_the_streak_from_today(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=[d(-3), d(-2), d(-1)])
    _patch(as_child, habit, archived=True)

    response = _patch(as_child, habit, archived=False)

    assert response.status_code == 200
    assert response.json()["archived"] is False
    assert response.json()["current_streak"] == 0
    assert response.json()["best_streak"] == 3
    assert put_check_in(as_child, habit).status_code == 201
    assert as_child.get(habit_path(habit)).json()["current_streak"] == 1


@pytest.mark.req("REQ-009")
def test_req_009_unarchive_with_20_active_habits_returns_422(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    archived = seed.habit(mia)
    _patch(as_child, archived, archived=True)
    for _ in range(20):
        seed.habit(mia)

    assert _patch(as_child, archived, archived=False).status_code == 422


@pytest.mark.req("REQ-009")
def test_req_009_delete_removes_check_ins_recalculates_earned_and_keeps_spent(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    reading = seed.habit(mia, "Reading", done=[d(-2), d(-1)])
    seed.habit(mia, "Piano", done=[d(-1)])
    seed.spend(mia, 2, kind="streak_saver")
    assert balance(as_child, mia) == 1  # earned 3, spent 2

    response = as_child.delete(habit_path(reading), headers=csrf(as_child))

    assert response.status_code == 204
    assert response.content == b""
    assert seed.count("check_in", "habit_id = ?", reading.hex) == 0
    assert seed.count("habit", "id = ?", reading.hex) == 0
    # Earned is now 1, spent stays 2: the shortfall is written off to exactly 0 (REQ-014).
    assert balance(as_child, mia) == 0
    assert seed.count("gem_transaction", "kind = 'streak_saver'") == 1
    assert as_child.get(habit_path(reading)).status_code == 404


@pytest.mark.req("REQ-009")
@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_req_009_unknown_habit_returns_404(as_child: TestClient, method: str) -> None:
    path = habit_path(uuid4())
    kwargs = {"json": {"title": "Reading"}} if method == "patch" else {}

    response = getattr(as_child, method)(path, headers=csrf(as_child), **kwargs)

    assert response.status_code == 404


# ---- REQ-010: parents and children's habits ----------------------------------------------


@pytest.mark.req("REQ-010")
def test_req_010_parent_creates_edits_archives_deletes_a_childs_habit_with_adjustments(
    as_parent: TestClient, family: SeededFamily, clock
) -> None:
    kavi = family["Kavi"]
    a_moment = timedelta(seconds=10)  # so "newest first" has distinct times to sort by

    created = create_habit(as_parent, kavi, "Piano")
    habit = created.json()["id"]
    clock.advance(a_moment)
    edited = _patch(as_parent, habit, title="Football")
    clock.advance(a_moment)
    archived = _patch(as_parent, habit, archived=True)
    clock.advance(a_moment)
    deleted = as_parent.delete(habit_path(habit), headers=csrf(as_parent))

    assert [created.status_code, edited.status_code, archived.status_code] == [201, 200, 200]
    assert deleted.status_code == 204
    assert _notes(as_parent, kavi) == [
        "habit_deleted",
        "habit_archived",
        "habit_updated",
        "habit_created",
    ]


@pytest.mark.req("REQ-010")
def test_req_010_parent_changing_the_other_parents_habit_returns_403(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Dad"], "Swimming")

    assert create_habit(as_parent, family["Dad"]).status_code == 403
    assert _patch(as_parent, habit, title="Football").status_code == 403
    assert as_parent.delete(habit_path(habit), headers=csrf(as_parent)).status_code == 403
    assert as_parent.get(habit_path(habit)).json()["title"] == "Swimming"


@pytest.mark.req("REQ-010")
def test_req_010_child_changing_a_siblings_habit_returns_403(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano")

    assert _patch(as_child, habit, archived=True).status_code == 403
    assert as_child.delete(habit_path(habit), headers=csrf(as_child)).status_code == 403
    assert as_child.get(habit_path(habit)).json()["archived"] is False


@pytest.mark.req("REQ-010")
def test_req_010_own_changes_record_no_adjustment(
    as_child: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_child, family["Mia"]).json()["id"]
    _patch(as_child, habit, title="Swimming")

    assert _notes(as_child, family["Mia"]) == []


@pytest.mark.req("REQ-010")
def test_req_010_patch_that_changes_nothing_records_no_adjustment(
    as_parent: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_parent, family["Kavi"], "Piano").json()["id"]

    assert _patch(as_parent, habit, title="Piano").status_code == 200

    assert _notes(as_parent, family["Kavi"]) == ["habit_created"]


# ---- REQ-016 / REQ-017 / REQ-020 / REQ-022: derived fields --------------------------------


@pytest.mark.req("REQ-016")
def test_req_016_daily_streak_fields_match_the_history(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    # An older run of 5, a gap, then 3 days ending yesterday with a saved day inside.
    done = [d(-12), d(-11), d(-10), d(-9), d(-8), d(-4), d(-3), d(-1)]
    habit = seed.habit(family["Mia"], "Reading", done=done, saved=[d(-2)])

    body = unlocked.get(habit_path(habit)).json()

    assert body["current_streak"] == 3  # the saved day bridges but doesn't count
    assert body["best_streak"] == 5
    assert body["streak_pending"] is True  # "Check in today to make it 4!"
    assert body["today_done"] is False


@pytest.mark.req("REQ-016")
def test_req_016_gap_before_yesterday_ends_the_run(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=[d(-5), d(-4), d(-3)])

    body = unlocked.get(habit_path(habit)).json()

    assert (body["current_streak"], body["best_streak"]) == (0, 3)


@pytest.mark.req("REQ-017")
def test_req_017_weekly_streak_and_progress_match_the_history(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    # Weeks -3, -2, -1 complete at 3 of 3; this week (Mon 19, Tue 20) has 2 so far.
    done = [d(-7 * w + i) for w in (1, 2, 3) for i in (-1, 0, 1)] + [d(-1), d(0)]
    habit = seed.habit(family["Mia"], "Piano", frequency="weekly", target=3, done=done)

    body = unlocked.get(habit_path(habit)).json()

    assert body["current_streak"] == 3  # this week is in progress and doesn't break the run
    assert body["streak_pending"] is True
    assert body["today_done"] is True
    assert body["week_progress"] == {"done": 2, "target": 3, "complete": False}


@pytest.mark.req("REQ-020")
def test_req_020_habit_read_lists_saveable_days_and_the_next_cost(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=[d(-5), d(-4), d(-3)])

    body = unlocked.get(habit_path(habit)).json()

    assert body["saveable_periods"] == [{"period_start": d(-2).isoformat(), "cost": 1}]
    assert body["next_saver_cost"] == 1


@pytest.mark.req("REQ-022")
def test_req_022_habits_listed_with_a_family_session_and_no_acting_member(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    seed.habit(family["Mia"], "Reading")
    seed.habit(family["Kavi"], "Piano")

    everyone = unlocked.get(HABITS)
    only_kavi = unlocked.get(HABITS, params={"member_id": str(family["Kavi"].id)})

    assert everyone.status_code == 200
    assert {h["title"] for h in everyone.json()} == {"Reading", "Piano"}
    assert [h["title"] for h in only_kavi.json()] == ["Piano"]


@pytest.mark.req("REQ-010")
def test_req_010_resending_the_current_weekly_target_changes_nothing(
    as_parent: TestClient, family: SeededFamily
) -> None:
    kavi = family["Kavi"]
    habit = create_habit(as_parent, kavi, "Piano", "weekly", weekly_target=3).json()["id"]

    response = _patch(as_parent, habit, weekly_target=3)

    assert response.status_code == 200
    assert response.json()["weekly_target"] == 3
    assert _notes(as_parent, kavi) == ["habit_created"]
