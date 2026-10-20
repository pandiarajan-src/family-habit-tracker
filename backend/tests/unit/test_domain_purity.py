"""The domain engine stays pure: no database, web framework, clock or logging.

That keeps every rule table-testable, and means the engine can't log nicknames or titles
[child-data-privacy #2].
"""

import ast
from pathlib import Path

import pytest

import app.domain

DOMAIN = Path(app.domain.__file__).parent
FORBIDDEN = ("app.db", "app.models", "app.clock", "fastapi", "sqlmodel", "sqlalchemy", "logging")


def _imports(path: Path) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


@pytest.mark.parametrize("path", sorted(DOMAIN.glob("*.py")), ids=lambda p: p.name)
def test_domain_modules_import_no_db_web_clock_or_logging(path: Path) -> None:
    bad = {n for n in _imports(path) if n.startswith(FORBIDDEN)}

    assert bad == set()
