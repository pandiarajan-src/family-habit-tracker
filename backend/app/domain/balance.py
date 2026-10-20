"""Gem balance (REQ-014, REQ-021, REQ-025).

Available = earned (derived, gems.py) + Σ transaction amounts. Transactions are negative for a
saver or a prize hold and positive for a release or a `correction_writeoff`. Holds stay in the
ledger while a claim is pending, so held gems are already out of the available balance and are
shown separately. A correction can push the raw balance below 0; the shortfall is written off so
the balance is exactly 0, and the next gem earned takes it to 1 (C6).
"""

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Balance:
    available: int  # never below 0
    held: int  # gems waiting on pending prize claims ("40 gems waiting for approval")


def raw_balance(earned: int, transactions: Iterable[int]) -> int:
    return earned + sum(transactions)


def writeoff_amount(earned: int, transactions: Iterable[int]) -> int:
    """The `correction_writeoff` that brings a negative balance back to exactly 0, else 0."""
    return max(0, -raw_balance(earned, transactions))


def balance(earned: int, transactions: Iterable[int], pending_claims: Iterable[int]) -> Balance:
    return Balance(
        available=max(0, raw_balance(earned, transactions)),
        held=sum(pending_claims),
    )


def can_afford(available: int, cost: int) -> bool:
    """A saver or claim needs the whole cost available; otherwise it's refused with 409."""
    return available >= cost


def gems_to_go(available: int, cost: int) -> int:
    """How many more gems are needed: "12 more gems to go!" (REQ-025)."""
    return max(0, cost - available)
