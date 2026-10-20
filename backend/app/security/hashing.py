"""Slow salted hashes (argon2id) for the family passcode and member PINs."""

from argon2 import PasswordHasher, profiles
from argon2.exceptions import InvalidHashError, VerificationError

# RFC 9106 "low memory" argon2id: 64 MiB, 3 passes. Tests swap in a cheap hasher (conftest).
PARAMETERS = profiles.RFC_9106_LOW_MEMORY

_hasher = PasswordHasher.from_parameters(PARAMETERS)


def hash_secret(secret: str) -> str:
    return _hasher.hash(secret)


def verify_secret(secret_hash: str, secret: str) -> bool:
    try:
        return _hasher.verify(secret_hash, secret)
    except VerificationError, InvalidHashError:
        return False
