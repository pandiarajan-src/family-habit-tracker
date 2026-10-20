"""PIN lockout (REQ-003): 5 wrong PINs lock that member only, for 5 minutes.

State is persisted on MemberCredential, so it survives restarts (unlike the passcode limiter).
"""

from datetime import datetime, timedelta

from app.models import MemberCredential

PIN_MAX_FAILURES = 5
PIN_LOCKOUT = timedelta(minutes=5)


def is_locked(credential: MemberCredential, now: datetime) -> bool:
    return credential.locked_until is not None and now < credential.locked_until


def record_failure(credential: MemberCredential, now: datetime) -> None:
    """Count a wrong PIN; the 5th in a row locks the member and restarts the count."""
    credential.failed_attempts += 1
    if credential.failed_attempts >= PIN_MAX_FAILURES:
        credential.failed_attempts = 0
        credential.locked_until = now + PIN_LOCKOUT


def record_success(credential: MemberCredential) -> None:
    credential.failed_attempts = 0
    credential.locked_until = None
