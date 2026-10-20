"""Security headers on every response (spec §6, [child-data-privacy #5])."""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

CSP = "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
# Swagger UI and ReDoc load their assets from a CDN; only served outside prod (see main.py).
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: "
    "https://fastapi.tiangolo.com; worker-src blob:; frame-ancestors 'none'"
)
DOCS_PATHS = frozenset({"/docs", "/docs/oauth2-redirect", "/redoc"})

STATIC_HEADERS = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def install_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def _security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.update(STATIC_HEADERS)
        response.headers["Content-Security-Policy"] = (
            DOCS_CSP if request.url.path in DOCS_PATHS else CSP
        )
        return response
