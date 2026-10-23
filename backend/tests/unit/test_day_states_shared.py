"""REQ-023 / REQ-017 (unit): the day and week states History shows, from the fixture the frontend
tests read too (frontend/src/lib/dayStates.cases.json), so the server and the screen agree."""

import json
from datetime import date
from pathlib import Path

import pytest

from app.domain.day_states import WeekState, WeekStateKind, day_state, week_state
from app.domain.streaks import DailyHistory, WeeklyHistory
from app.domain.weekly_targets import TargetChange

CASES_FILE = Path(__file__).resolve().parents[3] / "frontend/src/lib/dayStates.cases.json"
FIXTURE = json.loads(CASES_FILE.read_text())
TODAY = date.fromisoformat(FIXTURE["today"])


def _dates(values: list[str]) -> frozenset[date]:
    return frozenset(date.fromisoformat(v) for v in values)


def _history(case: dict) -> DailyHistory | WeeklyHistory:
    if case["frequency"] == "daily":
        return DailyHistory(_dates(case["done"]), _dates(case["saved"]))
    targets = tuple(
        TargetChange(date.fromisoformat(t["effective_from_week"]), t["target"])
        for t in case["targets"]
    )
    return WeeklyHistory(_dates(case["done"]), targets, saved_weeks=_dates(case["saved"]))


CASES = [pytest.param(case, id=case["name"]) for case in FIXTURE["cases"]]


@pytest.mark.req("REQ-023")
@pytest.mark.parametrize("case", CASES)
def test_req_023_day_states_match_the_shared_fixture(case: dict) -> None:
    history = _history(case)
    created_on = date.fromisoformat(case["created_on"])

    actual = {
        day: day_state(history, date.fromisoformat(day), TODAY, created_on) for day in case["days"]
    }

    assert actual == case["days"]


@pytest.mark.req("REQ-017")
@pytest.mark.parametrize("case", [c for c in CASES if c.values[0]["frequency"] == "weekly"])
def test_req_017_week_states_match_the_shared_fixture(case: dict) -> None:
    history = _history(case)
    assert isinstance(history, WeeklyHistory)
    created_on = date.fromisoformat(case["created_on"])

    for monday, expected in case["weeks"].items():
        state = week_state(history, date.fromisoformat(monday), TODAY, created_on)
        want = expected and WeekState(
            WeekStateKind(expected["kind"]), expected["done"], expected["target"]
        )
        assert state == want, monday
