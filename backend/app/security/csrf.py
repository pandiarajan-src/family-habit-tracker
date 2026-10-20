"""Double-submit CSRF check: the `csrf_token` cookie must be echoed in `X-CSRF-Token`."""

import secrets

from fastapi import HTTPException, Request, status

CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def check_csrf(request: Request) -> None:
    """Raise 403 for a state-changing request whose header doesn't match the cookie."""
    if request.method in SAFE_METHODS:
        return
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not secrets.compare_digest(cookie, header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Missing or invalid CSRF token")
