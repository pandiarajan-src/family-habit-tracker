"""Error bodies are `{"detail": ...}` [api-conventions #4] and never echo submitted values.

FastAPI's default 422 includes each invalid `input`, which would put passcodes, PINs and
nicknames into responses and any log that records them [child-data-privacy #2].
"""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    detail = [
        {"type": error["type"], "loc": list(error["loc"]), "msg": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": detail}
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_error)
