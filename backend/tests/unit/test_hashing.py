"""REQ-001 / REQ-003 (unit): passcode and PIN hashing."""

import pytest

from app.security.hashing import hash_secret, verify_secret

pytestmark = [pytest.mark.req("REQ-001"), pytest.mark.req("REQ-003")]


def test_req_001_hash_verifies_the_right_secret_only() -> None:
    hashed = hash_secret("owl-sunflower-26")

    assert verify_secret(hashed, "owl-sunflower-26")
    assert not verify_secret(hashed, "owl-sunflower-27")


def test_req_001_hash_is_salted_argon2id() -> None:
    first, second = hash_secret("3579"), hash_secret("3579")

    assert first != second
    assert first.startswith("$argon2id$")


def test_req_001_a_corrupt_hash_is_a_failed_check_not_an_error() -> None:
    assert not verify_secret("not-a-hash", "3579")
