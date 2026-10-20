"""REQ-021 / REQ-014 / REQ-025 (unit): balance, held gems and write-offs."""

import pytest

from app.domain.balance import (
    Balance,
    balance,
    can_afford,
    gems_to_go,
    raw_balance,
    writeoff_amount,
)

SAVER = -3
HOLD = -10
RELEASE = 10


@pytest.mark.req("REQ-021")
def test_req_021_available_is_earned_minus_spent_and_held_shown_separately() -> None:
    assert balance(earned=50, transactions=[SAVER, HOLD], pending_claims=[10]) == Balance(
        available=37, held=10
    )


@pytest.mark.req("REQ-025")
def test_req_025_a_cancelled_or_declined_claim_releases_the_hold() -> None:
    assert balance(earned=50, transactions=[HOLD, RELEASE], pending_claims=[]) == Balance(
        available=50, held=0
    )


@pytest.mark.req("REQ-021")
def test_req_021_balance_is_never_shown_below_zero() -> None:
    assert balance(earned=2, transactions=[HOLD], pending_claims=[10]).available == 0


@pytest.mark.req("REQ-014")
def test_req_014_a_shortfall_is_written_off_to_exactly_zero_and_the_next_gem_gives_1() -> None:
    spent = [-10]
    assert raw_balance(10, spent) == 0

    # A parent removes check-ins: earned drops from 10 to 4.
    writeoff = writeoff_amount(4, spent)
    ledger = [*spent, writeoff]

    assert writeoff == 6
    assert raw_balance(4, ledger) == 0
    assert writeoff_amount(4, ledger) == 0  # already reconciled: no second write-off
    assert raw_balance(5, ledger) == 1  # the next gem earned
    assert raw_balance(10, ledger) == 6  # check-ins added back: gems back, write-off kept


@pytest.mark.req("REQ-014")
@pytest.mark.parametrize(("earned", "transactions"), [(10, [-10]), (10, []), (0, [])])
def test_req_014_no_write_off_while_the_balance_is_zero_or_more(
    earned: int, transactions: list[int]
) -> None:
    assert writeoff_amount(earned, transactions) == 0


@pytest.mark.req("REQ-025")
@pytest.mark.parametrize(
    ("available", "cost", "affordable", "to_go"),
    [(40, 40, True, 0), (41, 40, True, 0), (28, 40, False, 12), (0, 1, False, 1)],
)
def test_req_025_a_claim_or_saver_needs_the_whole_cost(
    available: int, cost: int, affordable: bool, to_go: int
) -> None:
    assert can_afford(available, cost) is affordable
    assert gems_to_go(available, cost) == to_go  # "12 more gems to go!"
