"""REQ-018/019 earned gems, REQ-021 balance and history, REQ-014 write-offs after corrections."""

from collections.abc import Callable
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.support import (
    MEMBERS,
    TODAY,
    Person,
    SeededFamily,
    Seeder,
    act_as,
    balance,
    claim,
    create_prize,
    csrf,
    d,
    decide,
    delete_check_in,
    gems,
    habit_path,
    put_check_in,
)


def _history(client: TestClient, person: Person, **params) -> list[dict]:
    response = client.get(f"{MEMBERS}/{person.id}/gem-transactions", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _days(first: int, last: int) -> list:
    return [d(i) for i in range(first, last + 1)]


# ---- REQ-018: daily habits -----------------------------------------------------------------


@pytest.mark.req("REQ-018")
@pytest.mark.parametrize(
    ("streak_days", "expected"),
    [
        (4, 4),
        (5, 5 + 5),
        (7, 7 + 5 + 7),  # 19 gems for a 7-day streak
        (12, 12 + 5 + 7 + 5),
        (14, 14 + 5 + 7 + 5 + 7),
    ],
)
def test_req_018_balance_after_a_scripted_daily_streak(
    unlocked: TestClient, family: SeededFamily, seed: Seeder, streak_days: int, expected: int
) -> None:
    seed.habit(family["Mia"], "Reading", done=_days(-streak_days + 1, 0))

    assert balance(unlocked, family["Mia"]) == expected


@pytest.mark.req("REQ-018")
def test_req_018_gems_are_per_habit_per_day(
    unlocked: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    for title in ("Reading", "Piano", "Swimming"):
        seed.habit(family["Mia"], title, done=[d(0)])

    assert balance(unlocked, family["Mia"]) == 3


@pytest.mark.req("REQ-018")
def test_req_018_backfill_that_joins_two_runs_recomputes_bonuses(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    # A run of 4 (no bonus yet), a gap yesterday, then today: 4 + 1 gems.
    habit = seed.habit(mia, "Reading", done=[d(-5), d(-4), d(-3), d(-2), d(0)])
    assert balance(as_child, mia) == 5

    put_check_in(as_child, habit, d(-1))

    # Now one run of 6: 6 gems plus the 5-day bonus.
    assert balance(as_child, mia) == 6 + 5


# ---- REQ-019: weekly habits ----------------------------------------------------------------


def _weeks_done(*weeks_back: int, per_week: int = 3) -> list:
    """`per_week` check-ins on Mon, Tue, Wed... of each listed past week."""
    return [d(-1 - 7 * w + i) for w in weeks_back for i in range(per_week)]


@pytest.mark.req("REQ-019")
@pytest.mark.parametrize(("weeks", "expected"), [(4, 4), (5, 5 + 5), (7, 7 + 5), (10, 10 + 10)])
def test_req_019_balance_after_scripted_weeks(
    unlocked: TestClient, family: SeededFamily, seed: Seeder, weeks: int, expected: int
) -> None:
    done = _weeks_done(*range(1, weeks + 1))
    seed.habit(family["Mia"], "Piano", frequency="weekly", target=3, done=done, created_on=d(-90))

    assert balance(unlocked, family["Mia"]) == expected


@pytest.mark.req("REQ-019")
def test_req_019_week_dropping_below_target_loses_its_gem_and_bonus(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", frequency="weekly", target=3, done=_weeks_done(1, 2, 3, 4, 5))
    assert balance(as_parent, kavi) == 10

    assert delete_check_in(as_parent, habit, _weeks_done(1)[0]).status_code == 204

    assert balance(as_parent, kavi) == 4  # weeks 2-5 still complete; no 5-week bonus


# ---- REQ-021: balance and history ----------------------------------------------------------


@pytest.mark.req("REQ-021")
def test_req_021_history_lists_derived_earnings_spends_and_holds_newest_first(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=_days(-9, -3))  # 7 days: 7 + 5 + 7 gems
    assert put_check_in(as_parent, habit, d(-1)).status_code == 201  # d-2 is now a gap
    prize = create_prize(as_parent, "Ice cream", 4).json()["id"]
    act_as(as_parent, mia)
    assert claim(as_parent, prize).status_code == 201

    events = _history(as_parent, mia)

    kinds = [(e["kind"], e["amount"], e["date"]) for e in events]
    assert ("daily_bonus_5", 5, d(-5).isoformat()) in kinds
    assert ("daily_bonus_7", 7, d(-3).isoformat()) in kinds
    assert ("prize_hold", -4, TODAY.isoformat()) in kinds
    assert [e["date"] for e in events] == sorted((e["date"] for e in events), reverse=True)
    assert sum(e["amount"] for e in events) == balance(as_parent, mia) == 20 - 4
    hold = next(e for e in events if e["kind"] == "prize_hold")
    assert hold["prize_claim_id"] is not None
    earned = next(e for e in events if e["kind"] == "daily_checkin")
    assert earned["habit_id"] == str(habit)


@pytest.mark.req("REQ-021")
def test_req_021_same_day_spends_are_newest_first(
    as_parent: TestClient, family: SeededFamily, seed: Seeder, clock
) -> None:
    mia = family["Mia"]
    seed.habit(mia, "Reading", done=_days(-6, 0))  # 19 gems
    first = create_prize(as_parent, "Ice cream", 4).json()["id"]
    second = create_prize(as_parent, "Cinema trip", 5).json()["id"]
    act_as(as_parent, mia)
    held = claim(as_parent, first).json()["id"]
    clock.advance(timedelta(minutes=1))
    decide(as_parent, held, "cancelled")
    clock.advance(timedelta(minutes=1))
    claim(as_parent, second)

    events = [(e["kind"], e["amount"]) for e in _history(as_parent, mia) if e["date"] == str(TODAY)]
    # Earnings come first on a day; then the ledger rows, latest first.
    assert events[0][0] == "daily_checkin"
    assert events[-3:] == [("prize_hold", -5), ("prize_release", 4), ("prize_hold", -4)]


@pytest.mark.req("REQ-021")
def test_req_021_held_gems_are_shown_separately(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    seed.habit(mia, "Reading", done=_days(-6, 0))  # 19 gems
    prize = create_prize(as_parent, "Cinema trip", 15).json()["id"]
    act_as(as_parent, mia)

    claim(as_parent, prize)

    assert gems(as_parent, mia) == (4, 15)  # "15 gems waiting for approval"
    listed = next(m for m in as_parent.get(MEMBERS).json() if m["id"] == str(mia.id))
    assert (listed["gem_balance"], listed["gems_held"]) == (4, 15)


@pytest.mark.req("REQ-021")
def test_req_021_saver_spend_appears_with_its_habit(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    habit = seed.habit(mia, "Reading", done=[d(-4), d(-3)])
    assert (
        as_child.post(
            f"{habit_path(habit)}/streak-savers",
            json={"period_start": d(-2).isoformat()},
            headers=csrf(as_child),
        ).status_code
        == 201
    )

    spend = next(e for e in _history(as_child, mia) if e["kind"] == "streak_saver")

    assert (spend["amount"], spend["habit_id"]) == (-1, str(habit))


@pytest.mark.req("REQ-021")
def test_req_021_history_range_filters_and_defaults_to_12_months(
    as_child: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    mia = family["Mia"]
    old = TODAY.replace(year=2025, month=9)
    seed.habit(mia, "Reading", created_on=old, done=[old, d(-10), d(-1)])

    default = _history(as_child, mia)
    narrow = _history(as_child, mia, **{"from": d(-10), "to": d(-10)})
    everything = _history(as_child, mia, **{"from": old})

    assert [e["date"] for e in default] == [d(-1).isoformat(), d(-10).isoformat()]
    assert [e["date"] for e in narrow] == [d(-10).isoformat()]
    assert len(everything) == 3


@pytest.mark.req("REQ-021")
def test_req_021_history_with_to_before_from_returns_422(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.get(
        f"{MEMBERS}/{family['Mia'].id}/gem-transactions",
        params={"from": d(0), "to": d(-1)},
    )

    assert response.status_code == 422


@pytest.mark.req("REQ-021")
def test_req_021_another_childs_history_returns_403(
    as_child: TestClient, family: SeededFamily
) -> None:
    response = as_child.get(f"{MEMBERS}/{family['Kavi'].id}/gem-transactions")

    assert response.status_code == 403


@pytest.mark.req("REQ-021")
def test_req_021_parent_sees_a_childs_history_and_unknown_is_404(
    as_parent: TestClient, family: SeededFamily
) -> None:
    assert as_parent.get(f"{MEMBERS}/{family['Kavi'].id}/gem-transactions").status_code == 200
    assert as_parent.get(f"{MEMBERS}/{uuid4()}/gem-transactions").status_code == 404


@pytest.mark.req("REQ-021")
def test_req_021_history_needs_an_acting_member_returns_403(
    unlocked: TestClient, family: SeededFamily
) -> None:
    assert unlocked.get(f"{MEMBERS}/{family['Mia'].id}/gem-transactions").status_code == 403


# ---- REQ-014: write-offs, on every path that lowers earnings -------------------------------


def _remove_check_in(client: TestClient, habit) -> None:
    assert delete_check_in(client, habit, d(-1)).status_code == 204


def _delete_habit(client: TestClient, habit) -> None:
    assert client.delete(habit_path(habit), headers=csrf(client)).status_code == 204


def _raise_weekly_target(client: TestClient, habit) -> None:
    response = client.patch(habit_path(habit), json={"weekly_target": 3}, headers=csrf(client))
    assert response.status_code == 200


@pytest.mark.req("REQ-014")
@pytest.mark.parametrize(
    ("lower_earnings", "frequency"),
    [
        (_remove_check_in, "daily"),
        (_delete_habit, "daily"),
        (_raise_weekly_target, "weekly"),
    ],
    ids=["check-in removed", "habit deleted", "weekly target raised"],
)
def test_req_014_lowering_earnings_after_spending_writes_off_to_exactly_zero(
    as_parent: TestClient,
    family: SeededFamily,
    seed: Seeder,
    lower_earnings: Callable[[TestClient, object], None],
    frequency: str,
) -> None:
    kavi = family["Kavi"]
    # Daily: 2 gems from yesterday and the day before. Weekly: this week (Mon, Tue) meets a
    # target of 2, so 1 gem. Kavi spends everything.
    if frequency == "daily":
        habit = seed.habit(kavi, "Piano", done=[d(-2), d(-1)])
    else:
        habit = seed.habit(kavi, "Piano", frequency="weekly", target=2, done=[d(-1), d(0)])
    seed.spend(kavi, balance(as_parent, kavi), kind="streak_saver")

    lower_earnings(as_parent, habit)

    assert balance(as_parent, kavi) == 0
    assert seed.count("gem_transaction", "kind = 'correction_writeoff'") == 1


@pytest.mark.req("REQ-014")
def test_req_014_next_gem_after_a_write_off_takes_the_balance_to_1(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", done=[d(-3), d(-2)])
    seed.spend(kavi, 2)
    delete_check_in(as_parent, habit, d(-3))
    delete_check_in(as_parent, habit, d(-2))
    assert balance(as_parent, kavi) == 0

    put_check_in(as_parent, habit, d(0))

    assert balance(as_parent, kavi) == 1


@pytest.mark.req("REQ-014")
def test_req_014_re_adding_removed_check_ins_restores_gems_and_keeps_the_write_off(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", done=[d(-3), d(-2)])
    seed.spend(kavi, 2)
    delete_check_in(as_parent, habit, d(-3))
    delete_check_in(as_parent, habit, d(-2))
    writeoffs = [e for e in _history(as_parent, kavi) if e["kind"] == "correction_writeoff"]
    assert sum(e["amount"] for e in writeoffs) == 2

    put_check_in(as_parent, habit, d(-3))
    put_check_in(as_parent, habit, d(-2))

    assert balance(as_parent, kavi) == 2  # earned 2 - spent 2 + written off 2
    assert seed.count("gem_transaction", "kind = 'correction_writeoff'") == 2


@pytest.mark.req("REQ-014")
def test_req_014_removal_with_no_shortfall_writes_nothing_off(
    as_parent: TestClient, family: SeededFamily, seed: Seeder
) -> None:
    kavi = family["Kavi"]
    habit = seed.habit(kavi, "Piano", done=[d(-2), d(-1)])

    delete_check_in(as_parent, habit, d(-1))

    assert balance(as_parent, kavi) == 1
    assert seed.count("gem_transaction") == 0
