"""Access logs keep the path but drop query values [child-data-privacy #2]."""

import logging

from app.security.log_redaction import StripQueryFilter, install_log_redaction


def _access_record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", path, "1.1", 200),
        None,
    )


def test_privacy_access_log_drops_the_query_string() -> None:
    record = _access_record("/api/v1/check-ins?member_id=abc&from=2026-10-01")

    assert StripQueryFilter().filter(record)

    assert record.getMessage() == '127.0.0.1:5000 - "GET /api/v1/check-ins HTTP/1.1" 200'


def test_privacy_records_without_access_args_pass_untouched() -> None:
    record = logging.LogRecord("app", logging.INFO, __file__, 1, "plain %s", ("x",), None)

    assert StripQueryFilter().filter(record)
    assert record.getMessage() == "plain x"


def test_privacy_access_args_without_a_string_path_pass_untouched() -> None:
    record = _access_record("/api/v1/health")
    record.args = ("127.0.0.1:5000", "GET", None, "1.1", 200)

    assert StripQueryFilter().filter(record)
    assert record.args == ("127.0.0.1:5000", "GET", None, "1.1", 200)


def test_privacy_install_keeps_sqlalchemy_quiet_and_adds_the_filter_once() -> None:
    install_log_redaction("DEBUG")
    install_log_redaction("DEBUG")

    access_filters = logging.getLogger("uvicorn.access").filters
    assert sum(isinstance(f, StripQueryFilter) for f in access_filters) == 1
    assert logging.getLogger("sqlalchemy").level == logging.WARNING
