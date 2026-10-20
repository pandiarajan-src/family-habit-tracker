"""REQ-028 (unit): the permission matrix (actor role, owner role, self, action -> allowed)."""

import pytest

from app.domain.permissions import SCOPES, Action, Role, is_allowed

P, C = Role.parent, Role.child
A = Action

# (action, actor, owner, is_self, parent_count, allowed, why)
MATRIX = [
    # Habits (REQ-008/010): own, or a parent for a child; never another parent's.
    (A.HABIT_WRITE, C, C, True, 2, True, "child, own habit"),
    (A.HABIT_WRITE, C, C, False, 2, False, "child, sibling's habit"),
    (A.HABIT_WRITE, C, P, False, 2, False, "child, parent's habit"),
    (A.HABIT_WRITE, P, P, True, 2, True, "parent, own habit"),
    (A.HABIT_WRITE, P, C, False, 2, True, "parent, child's habit"),
    (A.HABIT_WRITE, P, P, False, 2, False, "parent, other parent's habit"),
    # Today/yesterday check-ins (REQ-011/013) follow the habit rule.
    (A.CHECK_IN, C, C, True, 2, True, "child, own check-in"),
    (A.CHECK_IN, C, C, False, 2, False, "child, sibling's check-in"),
    (A.CHECK_IN, P, C, False, 2, True, "parent, child's check-in"),
    (A.CHECK_IN, P, P, False, 2, False, "parent, other parent's check-in"),
    # Older check-ins (REQ-014): only a parent correcting a child. Own → 422 window error.
    (A.CHECK_IN_CORRECTION, P, C, False, 2, True, "parent corrects child"),
    (A.CHECK_IN_CORRECTION, P, P, False, 2, False, "parent corrects other parent"),
    (A.CHECK_IN_CORRECTION, P, P, True, 2, False, "parent, own old day"),
    (A.CHECK_IN_CORRECTION, C, C, True, 2, False, "child, own old day"),
    # Streak savers (REQ-020).
    (A.STREAK_SAVER_USE, C, C, True, 2, True, "child, own saver"),
    (A.STREAK_SAVER_USE, P, C, False, 2, True, "parent saves for child"),
    (A.STREAK_SAVER_USE, C, C, False, 2, False, "child saves for sibling"),
    (A.STREAK_SAVER_USE, P, P, False, 2, False, "parent saves for other parent"),
    # PINs (REQ-005).
    (A.PIN_SET, C, C, True, 2, True, "child, own PIN"),
    (A.PIN_SET, P, C, False, 2, True, "parent resets child's PIN"),
    (A.PIN_SET, C, C, False, 2, False, "child sets sibling's PIN"),
    (A.PIN_SET, P, P, False, 2, False, "parent resets other parent's PIN"),
    # Members (REQ-006/007).
    (A.MEMBER_CREATE, P, None, False, 2, True, "parent adds member"),
    (A.MEMBER_CREATE, C, None, False, 2, False, "child adds member"),
    (A.MEMBER_PROFILE_EDIT, C, C, True, 2, True, "child edits own nickname"),
    (A.MEMBER_PROFILE_EDIT, C, C, False, 2, False, "child edits sibling's nickname"),
    (A.MEMBER_PROFILE_EDIT, P, C, False, 2, True, "parent edits child's nickname"),
    (A.MEMBER_ROLE_CHANGE, C, C, True, 2, False, "child changes own role"),
    (A.MEMBER_ROLE_CHANGE, P, C, False, 2, True, "parent changes a role"),
    (A.MEMBER_DELETE, P, C, False, 2, True, "parent removes child"),
    (A.MEMBER_DELETE, C, C, False, 2, False, "child removes sibling"),
    # Gem history and adjustments (REQ-015/021): self or a parent.
    (A.GEM_HISTORY_VIEW, C, C, True, 2, True, "child, own history"),
    (A.GEM_HISTORY_VIEW, C, C, False, 2, False, "child, sibling's history"),
    (A.GEM_HISTORY_VIEW, P, C, False, 2, True, "parent, child's history"),
    (A.ADJUSTMENTS_VIEW, C, C, False, 2, False, "child, sibling's changes"),
    (A.ADJUSTMENTS_VIEW, P, P, False, 2, True, "parent, other parent's changes"),
    (A.ADJUSTMENT_ACK, C, C, True, 2, True, "child acks own notice"),
    (A.ADJUSTMENT_ACK, P, C, False, 2, False, "parent acks child's notice"),
    # Prizes (REQ-024).
    (A.PRIZE_MANAGE, P, None, False, 2, True, "parent manages prizes"),
    (A.PRIZE_MANAGE, C, None, False, 2, False, "child manages prizes"),
    # Claims (REQ-025/026).
    (A.CLAIM_CREATE, C, C, True, 2, True, "child claims for self"),
    (A.CLAIM_CREATE, P, C, False, 2, False, "parent claims for child"),
    (A.CLAIM_CANCEL, C, C, True, 2, True, "claimant cancels"),
    (A.CLAIM_CANCEL, P, C, False, 2, False, "parent cancels child's claim"),
    (A.CLAIM_DECIDE, P, C, False, 2, True, "parent decides child's claim"),
    (A.CLAIM_DECIDE, P, P, False, 2, True, "parent decides other parent's claim"),
    (A.CLAIM_DECIDE, P, P, True, 2, False, "parent decides own claim, two parents"),
    (A.CLAIM_DECIDE, P, P, True, 1, True, "parent decides own claim, only parent"),
    (A.CLAIM_DECIDE, C, C, True, 1, False, "child decides own claim"),
    (A.CLAIM_DECIDE, C, P, False, 2, False, "child decides parent's claim"),
    # Family settings and signing a device out (REQ-027/002).
    (A.FAMILY_SETTINGS, P, None, False, 2, True, "parent changes timezone"),
    (A.FAMILY_SETTINGS, C, None, False, 2, False, "child changes timezone"),
    (A.DEVICE_SIGN_OUT, P, None, False, 2, True, "parent signs device out"),
    (A.DEVICE_SIGN_OUT, C, None, False, 2, False, "child signs device out"),
]


@pytest.mark.req("REQ-028")
@pytest.mark.parametrize(
    ("action", "actor", "owner", "is_self", "parent_count", "allowed"),
    [row[:6] for row in MATRIX],
    ids=[row[6] for row in MATRIX],
)
def test_req_028_permission_matrix(
    action: Action,
    actor: Role,
    owner: Role | None,
    is_self: bool,
    parent_count: int,
    allowed: bool,
) -> None:
    assert is_allowed(action, actor, owner, is_self=is_self, parent_count=parent_count) is allowed


@pytest.mark.req("REQ-028")
def test_req_028_every_action_has_a_rule_and_the_table_covers_every_action() -> None:
    assert set(SCOPES) == set(Action)
    assert {row[0] for row in MATRIX} == set(Action)


@pytest.mark.req("REQ-028")
def test_req_028_owner_based_rules_deny_when_the_owner_is_unknown() -> None:
    assert not is_allowed(A.HABIT_WRITE, P)
