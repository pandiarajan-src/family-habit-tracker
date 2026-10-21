"""REQ-011 check off today, REQ-012 repeats, REQ-013 yesterday, REQ-014 parent corrections,
REQ-023 history ranges, REQ-027 the family date."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    ADJUSTMENTS,
    CHECK_INS,
    FAMILY,
    STREAK_SAVERS,
    TODAY,
    SeededFamily,
    Seeder,
    act_as,
    balance,
    check_in_path,
    create_habit,
    csrf,
    d,
    delete_check_in,
    habit_path,
    put_check_in,
    set_timezone,
    unlock,
    use_saver,
)


@pytest.fixture
def reading(as_child: TestClient, family: SeededFamily, seed: Seeder):
    """Mia's daily habit, created long ago."""
    return seed.habit(family["Mia"], "Reading")


# ---- REQ-011: today ------------------------------------------------------------------------


@pytest.mark.req("REQ-011")
def test_req_011_check_in_today_returns_201_and_updates_streak_and_gems(
    as_child: TestClient, family: SeededFamily, reading
) -> None:
    mia = family["Mia"]

    response = put_check_in(as_child, reading)

    assert response.status_code == 201
    body = response.json()
    assert body["habit_id"] == str(reading)
    assert body["member_id"] == body["created_by_member_id"] == str(mia.id)
    assert body["date"] == TODAY.isoformat()
    assert body["created_at"].endswith("+01:00")  # family timezone offset (REQ-027)
    habit = as_child.get(habit_path(reading)).json()
    assert (habit["today_done"], habit["current_streak"]) == (True, 1)
    assert balance(as_child, mia) == 1


@pytest.mark.req("REQ-011")
def test_req_011_undo_returns_204_and_gems_and_streak_revert(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    # Four days in a row: checking in today makes it 5, which earns the 5-day bonus.
    habit = seed.habit(mia, "Reading", done=[d(-4), d(-3), d(-2), d(-1)])
    put_check_in(as_child, habit)
    assert balance(as_child, mia) == 10

    response = delete_check_in(as_child, habit)

    assert response.status_code == 204
    assert balance(as_child, mia) == 4
    body = as_child.get(habit_path(habit)).json()
    assert (body["today_done"], body["current_streak"]) == (False, 4)


@pytest.mark.req("REQ-011")
def test_req_011_undo_with_nothing_to_undo_is_still_204(as_child: TestClient, reading) -> None:
    assert delete_check_in(as_child, reading).status_code == 204


@pytest.mark.req("REQ-011")
def test_req_011_weekly_habit_counts_today_once(as_child: TestClient, family: SeededFamily) -> None:
    habit = create_habit(as_child, family["Mia"], "Piano", "weekly", weekly_target=3).json()["id"]

    put_check_in(as_child, habit)
    put_check_in(as_child, habit)

    assert as_child.get(habit_path(habit)).json()["week_progress"]["done"] == 1


@pytest.mark.req("REQ-011")
def test_req_011_unknown_habit_returns_404(as_child: TestClient) -> None:
    assert put_check_in(as_child, uuid4()).status_code == 404
    assert delete_check_in(as_child, uuid4()).status_code == 404


@pytest.mark.req("REQ-011")
def test_req_011_check_in_with_unexpected_body_field_returns_422(
    as_child: TestClient, reading
) -> None:
    response = as_child.put(
        check_in_path(reading, TODAY), json={"minutes": 40}, headers=csrf(as_child)
    )

    assert response.status_code == 422


@pytest.mark.req("REQ-011")
def test_req_011_child_cannot_check_in_a_siblings_habit_returns_403(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano")

    assert put_check_in(as_child, habit).status_code == 403
    assert delete_check_in(as_child, habit).status_code == 403


# ---- REQ-012: repeats ------------------------------------------------------------------------


@pytest.mark.req("REQ-012")
def test_req_012_repeat_put_returns_200_with_the_same_check_in(
    as_child: TestClient, family: SeededFamily, reading, seed: Seeder
) -> None:
    first = put_check_in(as_child, reading)

    second = put_check_in(as_child, reading)

    assert (first.status_code, second.status_code) == (201, 200)
    assert second.json() == first.json()
    assert seed.count("check_in", "habit_id = ?", reading.hex) == 1
    assert balance(as_child, family["Mia"]) == 1


# ---- REQ-013: yesterday and the window -----------------------------------------------------


@pytest.mark.req("REQ-013")
def test_req_013_yesterday_returns_201_and_recalculates(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=[d(-3), d(-2)])

    response = put_check_in(as_child, habit, d(-1))

    assert response.status_code == 201
    assert response.json()["date"] == d(-1).isoformat()
    assert as_child.get(habit_path(habit)).json()["current_streak"] == 3


@pytest.mark.req("REQ-013")
@pytest.mark.parametrize("offset", [-2, -30])
def test_req_013_own_check_in_before_yesterday_returns_422(
    as_child: TestClient, reading, offset: int
) -> None:
    response = put_check_in(as_child, reading, d(offset))

    assert response.status_code == 422
    assert "today and yesterday" in response.json()["detail"]
    assert delete_check_in(as_child, reading, d(offset)).status_code == 422


@pytest.mark.req("REQ-013")
def test_req_013_future_date_returns_422(as_child: TestClient, reading) -> None:
    response = put_check_in(as_child, reading, d(1))

    assert response.status_code == 422
    assert "future" in response.json()["detail"]


@pytest.mark.req("REQ-013")
def test_req_013_date_before_the_habit_was_created_returns_422(
    as_child: TestClient, family: SeededFamily
) -> None:
    habit = create_habit(as_child, family["Mia"]).json()["id"]  # created today

    response = put_check_in(as_child, habit, d(-1))

    assert response.status_code == 422
    assert "before the habit" in response.json()["detail"]


@pytest.mark.req("REQ-013")
def test_req_013_invalid_date_in_path_returns_422(as_child: TestClient, reading) -> None:
    response = as_child.put(f"{habit_path(reading)}/check-ins/20-10-2026", headers=csrf(as_child))

    assert response.status_code == 422


# ---- REQ-014: parent corrections -----------------------------------------------------------


@pytest.mark.req("REQ-014")
def test_req_014_parent_backfills_a_child_30_days_back_with_an_adjustment(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano")

    response = put_check_in(as_parent, habit, d(-30))

    assert response.status_code == 201
    assert response.json()["created_by_member_id"] == str(family["Mum"].id)
    assert response.json()["member_id"] == str(kavi.id)
    notes = as_parent.get(ADJUSTMENTS, params={"member_id": str(kavi.id)}).json()
    assert [(n["kind"], n["habit_id"], n["date"]) for n in notes] == [
        ("check_in_added", str(habit), d(-30).isoformat())
    ]
    assert balance(as_parent, kavi) == 1


@pytest.mark.req("REQ-014")
def test_req_014_parent_removes_a_childs_old_check_in_with_an_adjustment(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", done=[d(-20)])

    response = delete_check_in(as_parent, habit, d(-20))

    assert response.status_code == 204
    assert balance(as_parent, kavi) == 0
    notes = as_parent.get(ADJUSTMENTS, params={"member_id": str(kavi.id)}).json()
    assert [n["kind"] for n in notes] == ["check_in_removed"]


@pytest.mark.req("REQ-014")
def test_req_014_parent_correction_still_cannot_go_before_created_on_or_into_the_future(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano", created_on=d(-10))

    assert put_check_in(as_parent, habit, d(-11)).status_code == 422
    assert put_check_in(as_parent, habit, d(1)).status_code == 422


@pytest.mark.req("REQ-014")
def test_req_014_parent_editing_the_other_parents_old_day_returns_403(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Dad"], "Swimming", done=[d(-5)])

    assert put_check_in(as_parent, habit, d(-6)).status_code == 403
    assert delete_check_in(as_parent, habit, d(-5)).status_code == 403
    assert seed.count("check_in", "habit_id = ?", habit.hex) == 1


@pytest.mark.req("REQ-014")
def test_req_014_parent_cannot_backfill_their_own_old_days(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mum"], "Swimming")

    assert put_check_in(as_parent, habit, d(-5)).status_code == 422


@pytest.mark.req("REQ-014")
def test_req_014_parent_check_in_today_for_a_child_also_notes_it(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano")

    assert put_check_in(as_parent, habit).status_code == 201

    notes = as_parent.get(ADJUSTMENTS, params={"member_id": str(family["Kavi"].id)}).json()
    assert [n["kind"] for n in notes] == ["check_in_added"]


# ---- REQ-020: a saved day can't be checked in ----------------------------------------------


@pytest.mark.req("REQ-020")
def test_req_020_check_in_on_a_saved_day_returns_409(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Kavi"], "Piano", done=[d(-4)], saved=[d(-3)])

    response = put_check_in(as_parent, habit, d(-3))

    assert response.status_code == 409
    assert seed.count("check_in", "habit_id = ?", habit.hex) == 1


# ---- REQ-023: history ranges ---------------------------------------------------------------


@pytest.mark.req("REQ-023")
@pytest.mark.parametrize("path", [CHECK_INS, STREAK_SAVERS])
def test_req_023_range_over_62_days_returns_422(unlocked: TestClient, path: str) -> None:
    ok = unlocked.get(path, params={"from": d(-61), "to": d(0)})
    too_long = unlocked.get(path, params={"from": d(-62), "to": d(0)})
    backwards = unlocked.get(path, params={"from": d(0), "to": d(-1)})
    missing = unlocked.get(path)

    assert ok.status_code == 200
    assert too_long.status_code == 422
    assert "62" in too_long.json()["detail"]
    assert backwards.status_code == 422
    assert missing.status_code == 422


@pytest.mark.req("REQ-023")
def test_req_023_data_from_12_months_ago_is_returned(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    year_ago = TODAY.replace(year=2025)
    seed.habit(family["Mia"], "Reading", created_on=year_ago, done=[year_ago], saved=[d(-1)])
    seed.habit(family["Kavi"], "Piano", created_on=year_ago, done=[year_ago])

    response = unlocked.get(CHECK_INS, params={"from": year_ago, "to": year_ago})
    mia_only = unlocked.get(
        CHECK_INS,
        params={"from": year_ago, "to": year_ago, "member_id": str(family["Mia"].id)},
    )
    savers = unlocked.get(
        STREAK_SAVERS,
        params={"from": d(-7), "to": d(0), "member_id": str(family["Mia"].id)},
    )

    assert response.status_code == 200
    assert [c["date"] for c in response.json()] == [year_ago.isoformat()] * 2
    assert len(mia_only.json()) == 1
    assert [s["period_start"] for s in savers.json()] == [d(-1).isoformat()]


@pytest.mark.req("REQ-023")
def test_req_023_ranges_only_return_this_familys_data(
    unlocked: TestClient, family: SeededFamily, other_family: SeededFamily, db
) -> None:
    Seeder(db, other_family.id).habit(other_family["Gran"], "Reading", done=[d(-1)])

    assert unlocked.get(CHECK_INS, params={"from": d(-7), "to": d(0)}).json() == []


# ---- REQ-027: family date ------------------------------------------------------------------


@pytest.mark.req("REQ-027")
def test_req_027_check_in_at_2359_local_counts_for_the_local_date(
    make_client, family: SeededFamily, seed: Seeder, clock
) -> None:
    device = make_client()
    unlock(device)
    act_as(device, family["Mum"])
    assert set_timezone(device, "America/New_York").status_code == 200
    habit = seed.habit(family["Mum"], "Swimming")
    # 03:59 UTC on Wed 21 Oct is 23:59 on Tue 20 Oct in New York.
    clock.advance(datetime(2026, 10, 21, 3, 59, tzinfo=UTC) - clock.now())
    unlock(device)
    act_as(device, family["Mum"])

    today_local = put_check_in(device, habit, TODAY)
    utc_date = put_check_in(device, habit, d(1))

    assert today_local.status_code == 201
    assert today_local.json()["created_at"].endswith("-04:00")
    assert utc_date.status_code == 422  # still a future day for the family


@pytest.mark.req("REQ-027")
def test_req_027_timezone_change_keeps_existing_check_in_dates(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mum"], "Swimming")
    put_check_in(as_parent, habit)

    # 08:00 UTC is 21:00 on Monday in Pago Pago (UTC-11), so the family's today moves back.
    set_timezone(as_parent, "Pacific/Pago_Pago")

    listed = as_parent.get(CHECK_INS, params={"from": d(-1), "to": d(1)}).json()
    assert [c["date"] for c in listed] == [TODAY.isoformat()]
    assert as_parent.get(FAMILY).json()["timezone"] == "Pacific/Pago_Pago"
    assert put_check_in(as_parent, habit, d(-1)).status_code == 201  # the new zone's today
    assert put_check_in(as_parent, habit, d(1)).status_code == 422  # two days ahead now


# ---- A checked-in day can't be saved -----------------------------------------------------


@pytest.mark.req("REQ-020")
def test_req_020_saver_and_check_in_on_the_same_day_conflict_both_ways(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    habit = seed.habit(family["Mia"], "Reading", done=[d(-2)])
    put_check_in(as_child, habit, d(-1))

    response = use_saver(as_child, habit, d(-1))

    assert response.status_code == 409
