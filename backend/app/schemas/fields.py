"""Field types shared by the request schemas (spec §3 limits)."""

import unicodedata
from typing import Annotated

from pydantic import AfterValidator, Field, StringConstraints

# Code points that only modify or join the emoji before them.
_ZWJ = "‍"
_MODIFIERS = frozenset({"️", "︎", "⃣"})
_SKIN_TONES = range(0x1F3FB, 0x1F400)
_TAGS = range(0xE0020, 0xE0080)
_REGIONAL_INDICATORS = range(0x1F1E6, 0x1F200)


def is_single_emoji(value: str) -> bool:
    """Whether `value` is exactly one emoji grapheme (spec §3 Member.avatar_emoji).

    Covers plain emoji, presentation selectors, skin tones, ZWJ sequences (👨‍👩‍👧), flags
    (two regional indicators) and tag sequences. Text, digits, spaces and keycaps are refused.
    """
    if not value or len(value) > 16:
        return False
    if all(ord(c) in _REGIONAL_INDICATORS for c in value):
        return len(value) == 2
    bases = 0
    previous_was_zwj = True  # the first base starts the grapheme
    for char in value:
        code = ord(char)
        if char == _ZWJ:
            if previous_was_zwj:
                return False
            previous_was_zwj = True
            continue
        if char in _MODIFIERS or code in _SKIN_TONES or code in _TAGS:
            if previous_was_zwj:
                return False
            continue
        if not previous_was_zwj or not _is_emoji_base(char):
            return False
        bases += 1
        previous_was_zwj = False
    return bases >= 1 and not previous_was_zwj


def _is_emoji_base(char: str) -> bool:
    code = ord(char)
    return code >= 0x80 and (unicodedata.category(char) == "So" or 0x1F000 <= code <= 0x1FAFF)


def _single_emoji(value: str) -> str:
    if not is_single_emoji(value):
        raise ValueError("must be exactly one emoji")
    return value


def _strip(max_length: int, min_length: int = 1):
    return StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)


Nickname = Annotated[str, _strip(20)]
AvatarEmoji = Annotated[str, AfterValidator(_single_emoji)]
Pin = Annotated[str, Field(pattern=r"^[0-9]{4}$", description="Exactly 4 digits")]
Title = Annotated[str, _strip(40)]
GoalNote = Annotated[str, _strip(60, min_length=0)]
