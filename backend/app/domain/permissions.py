"""Who can change what (REQ-028).

Members change their own data. Parents also change the children's habits, check-ins, PINs and
streak savers, plus members, prizes, claims and family settings. Nobody changes another parent's
habits (REQ-010). A parent decides someone else's prize claim, or their own when they are the only
parent (REQ-026, C5).

Check-ins outside today/yesterday are a separate action: only a parent correcting a child may do
that (REQ-014). For your own habit it's a 422 date-window error (REQ-013), so callers check
`CHECK_IN` first and only fall back to `CHECK_IN_CORRECTION` for an out-of-window date.
"""

from enum import StrEnum, auto


class Role(StrEnum):
    parent = "parent"
    child = "child"


class Action(StrEnum):
    HABIT_WRITE = auto()  # create, edit, archive, delete (REQ-008/009/010)
    CHECK_IN = auto()  # add or remove today's or yesterday's check-in (REQ-011/013)
    CHECK_IN_CORRECTION = auto()  # add or remove an older check-in (REQ-014)
    STREAK_SAVER_USE = auto()  # REQ-020
    PIN_SET = auto()  # your own with the current PIN, or a parent resetting a child's (REQ-005)
    MEMBER_CREATE = auto()  # REQ-006
    MEMBER_PROFILE_EDIT = auto()  # nickname and avatar (REQ-006)
    MEMBER_ROLE_CHANGE = auto()  # REQ-006
    MEMBER_DELETE = auto()  # REQ-007
    GEM_HISTORY_VIEW = auto()  # REQ-021
    ADJUSTMENTS_VIEW = auto()  # REQ-015
    ADJUSTMENT_ACK = auto()  # REQ-015
    PRIZE_MANAGE = auto()  # REQ-024
    CLAIM_CREATE = auto()  # claims are for yourself (REQ-025)
    CLAIM_CANCEL = auto()  # REQ-025
    CLAIM_DECIDE = auto()  # approve or decline (REQ-026)
    FAMILY_SETTINGS = auto()  # timezone (REQ-027)
    DEVICE_SIGN_OUT = auto()  # REQ-002


class Scope(StrEnum):
    SELF = auto()
    SELF_OR_PARENT = auto()
    SELF_OR_PARENT_OF_CHILD = auto()
    PARENT_OF_CHILD = auto()
    PARENT = auto()
    PARENT_DECIDER = auto()  # a parent; their own only when they are the only parent


SCOPES: dict[Action, Scope] = {
    Action.HABIT_WRITE: Scope.SELF_OR_PARENT_OF_CHILD,
    Action.CHECK_IN: Scope.SELF_OR_PARENT_OF_CHILD,
    Action.CHECK_IN_CORRECTION: Scope.PARENT_OF_CHILD,
    Action.STREAK_SAVER_USE: Scope.SELF_OR_PARENT_OF_CHILD,
    Action.PIN_SET: Scope.SELF_OR_PARENT_OF_CHILD,
    Action.MEMBER_CREATE: Scope.PARENT,
    Action.MEMBER_PROFILE_EDIT: Scope.SELF_OR_PARENT,
    Action.MEMBER_ROLE_CHANGE: Scope.PARENT,
    Action.MEMBER_DELETE: Scope.PARENT,
    Action.GEM_HISTORY_VIEW: Scope.SELF_OR_PARENT,
    Action.ADJUSTMENTS_VIEW: Scope.SELF_OR_PARENT,
    Action.ADJUSTMENT_ACK: Scope.SELF,
    Action.PRIZE_MANAGE: Scope.PARENT,
    Action.CLAIM_CREATE: Scope.SELF,
    Action.CLAIM_CANCEL: Scope.SELF,
    Action.CLAIM_DECIDE: Scope.PARENT_DECIDER,
    Action.FAMILY_SETTINGS: Scope.PARENT,
    Action.DEVICE_SIGN_OUT: Scope.PARENT,
}


def is_allowed(
    action: Action,
    actor: Role,
    owner: Role | None = None,
    *,
    is_self: bool = False,
    parent_count: int = 1,
) -> bool:
    """Whether `actor` may do `action` to data owned by a member with role `owner`.

    `is_self` is true when the actor owns the data (or is the claimant / adjustment target).
    `owner` is None for family-wide actions such as prizes or settings.
    """
    is_parent = actor is Role.parent
    parent_of_child = is_parent and owner is Role.child and not is_self
    rules = {
        Scope.SELF: is_self,
        Scope.SELF_OR_PARENT: is_self or is_parent,
        Scope.SELF_OR_PARENT_OF_CHILD: is_self or parent_of_child,
        Scope.PARENT_OF_CHILD: parent_of_child,
        Scope.PARENT: is_parent,
        Scope.PARENT_DECIDER: is_parent and (not is_self or parent_count == 1),
    }
    return rules[SCOPES[action]]
