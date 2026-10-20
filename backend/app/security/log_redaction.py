"""Keep request data out of logs [child-data-privacy #2]: IDs only, no bodies or query values."""

import logging


class StripQueryFilter(logging.Filter):
    """Drops the query string from uvicorn access-log lines."""

    def filter(self, record: logging.LogRecord) -> bool:
        # uvicorn.access args: (client_addr, method, full_path, http_version, status_code)
        if isinstance(record.args, tuple) and len(record.args) >= 3:
            args = list(record.args)
            if isinstance(args[2], str):
                args[2] = args[2].split("?", 1)[0]
            record.args = tuple(args)
        return True


_access_filter = StripQueryFilter()


def install_log_redaction(log_level: str) -> None:
    logging.getLogger("app").setLevel(log_level)
    access = logging.getLogger("uvicorn.access")
    if _access_filter not in access.filters:
        access.addFilter(_access_filter)
    # SQLAlchemy logs statement parameters and result rows (nicknames) at INFO/DEBUG, even
    # when only the root logger is turned up. Keep it at WARNING whatever LOG_LEVEL says.
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
