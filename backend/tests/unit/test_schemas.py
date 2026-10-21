"""Request validation rules (spec §7 unit column): PINs, nicknames, emoji, habits, prize costs."""

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.credential import MemberCredentialUpdate
from app.schemas.fields import is_single_emoji
from app.schemas.habit import HabitCreate, HabitUpdate
from app.schemas.member import MemberCreate, MemberUpdate
from app.schemas.prize import PrizeCreate
from app.services.adjustments import year_ago


@pytest.mark.req("REQ-005")
@pytest.mark.parametrize(
    ("pin", "ok"), [("1234", True), ("0000", True), ("12a4", False), ("123", False), ("", False)]
)
def test_req_005_pin_is_exactly_4_digits(pin: str, ok: bool) -> None:
    if ok:
        assert MemberCredentialUpdate(pin=pin).pin == pin
    else:
        with pytest.raises(ValidationError):
            MemberCredentialUpdate(pin=pin)


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize(
    "emoji",
    ["🦉", "🌻", "🐬", "🦖", "❤️", "👍🏽", "👨‍👩‍👧", "🇬🇧", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
    ids=[
        "owl",
        "flower",
        "dolphin",
        "dino",
        "heart+vs16",
        "skin tone",
        "zwj family",
        "flag",
        "tags",
    ],
)
def test_req_006_single_emoji_accepted(emoji: str) -> None:
    assert is_single_emoji(emoji)


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize(
    "value",
    ["", "a", "Mia", "🦉🦉", "🦉 ", "x🦉", "‍🦉", "🦉‍", "🦉‍‍🐬", "🏽", "️", "🇬", "1️⃣", "é", "🦉" * 9],
)
def test_req_006_anything_but_one_emoji_refused(value: str) -> None:
    assert not is_single_emoji(value)


@pytest.mark.req("REQ-006")
def test_req_006_nickname_is_trimmed_and_1_to_20_characters() -> None:
    base = {"avatar_emoji": "🦊", "role": "child", "pin": "1234"}

    assert MemberCreate(nickname="  Zuzu ", **base).nickname == "Zuzu"
    assert MemberCreate(nickname="x" * 20, **base).nickname == "x" * 20
    for bad in ("", "   ", "x" * 21):
        with pytest.raises(ValidationError):
            MemberCreate(nickname=bad, **base)


@pytest.mark.req("REQ-006")
@pytest.mark.parametrize("field", ["birthdate", "email", "age", "photo", "location"])
def test_req_006_member_schemas_forbid_extra_fields(field: str) -> None:
    with pytest.raises(ValidationError):
        MemberCreate(nickname="Zuzu", avatar_emoji="🦊", role="child", pin="1234", **{field: "x"})
    with pytest.raises(ValidationError):
        MemberUpdate(**{field: "x"})


@pytest.mark.req("REQ-008")
@pytest.mark.parametrize(
    ("fields", "ok"),
    [
        ({"frequency": "daily"}, True),
        ({"frequency": "weekly", "weekly_target": 1}, True),
        ({"frequency": "weekly", "weekly_target": 7}, True),
        ({"frequency": "weekly"}, False),
        ({"frequency": "weekly", "weekly_target": 0}, False),
        ({"frequency": "weekly", "weekly_target": 8}, False),
        ({"frequency": "daily", "weekly_target": 3}, False),
        ({"frequency": "daily", "title": "x" * 41}, False),
        ({"frequency": "daily", "title": ""}, False),
        ({"frequency": "daily", "goal_note": "x" * 61}, False),
        ({"frequency": "daily", "goal_note": "x" * 60}, True),
    ],
)
def test_req_008_habit_validation(fields: dict, ok: bool) -> None:
    body = {"member_id": uuid4(), "title": "Reading"} | fields
    if ok:
        HabitCreate(**body)
    else:
        with pytest.raises(ValidationError):
            HabitCreate(**body)


@pytest.mark.req("REQ-009")
def test_req_009_habit_update_tells_a_cleared_note_from_an_unsent_one() -> None:
    assert HabitUpdate(goal_note=None).model_dump(exclude_unset=True) == {"goal_note": None}
    assert HabitUpdate(title="Piano").model_dump(exclude_unset=True) == {"title": "Piano"}


@pytest.mark.req("REQ-024")
@pytest.mark.parametrize(("cost", "ok"), [(1, True), (10_000, True), (0, False), (10_001, False)])
def test_req_024_prize_cost_is_1_to_10000(cost: int, ok: bool) -> None:
    if ok:
        assert PrizeCreate(title="Ice cream", gem_cost=cost).gem_cost == cost
    else:
        with pytest.raises(ValidationError):
            PrizeCreate(title="Ice cream", gem_cost=cost)


@pytest.mark.req("REQ-015")
@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 10, 20), date(2025, 10, 20)),
        (date(2028, 2, 29), date(2027, 2, 28)),  # no 29 Feb last year
    ],
)
def test_req_015_twelve_months_back(today: date, expected: date) -> None:
    assert year_ago(today) == expected
