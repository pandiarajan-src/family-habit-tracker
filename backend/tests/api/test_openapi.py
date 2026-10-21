"""OpenAPI matches the conventions [api-conventions #1 #2 #3 #7]: every path under /api/v1, every
operation summarised, response models and status codes declared, request schemas closed."""

import pytest
from fastapi.testclient import TestClient

UNAUTHENTICATED = {("post", "/api/v1/sessions"), ("get", "/api/v1/health")}
SAFE = {"get"}


@pytest.fixture
def spec(client: TestClient) -> dict:
    return client.get("/openapi.json").json()


def _operations(spec: dict):
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            yield method, path, op


def test_openapi_every_path_is_under_api_v1_with_plural_nouns(spec: dict) -> None:
    for path in spec["paths"]:
        assert path.startswith("/api/v1/"), path
        first = path.removeprefix("/api/v1/").split("/")[0]
        assert first in {
            "health",
            "sessions",
            "families",
            "members",
            "habits",
            "check-ins",
            "streak-savers",
            "prizes",
            "prize-claims",
            "adjustments",
        }, path


def test_openapi_every_operation_has_a_summary(spec: dict) -> None:
    for method, path, op in _operations(spec):
        assert op.get("summary"), f"{method} {path}"


def test_openapi_success_responses_have_a_schema_or_are_204(spec: dict) -> None:
    for method, path, op in _operations(spec):
        successes = {code: r for code, r in op["responses"].items() if code.startswith("2")}
        assert successes, f"{method} {path}"
        for code, response in successes.items():
            if code == "204":
                assert "content" not in response, f"{method} {path}"
            else:
                schema = response["content"]["application/json"]["schema"]
                assert "$ref" in schema or "items" in schema, f"{method} {path} {code}"


def test_openapi_status_codes_are_declared(spec: dict) -> None:
    for method, path, op in _operations(spec):
        codes = set(op["responses"])
        where = f"{method} {path}"
        if (method, path) not in UNAUTHENTICATED:
            assert "401" in codes, where
            assert "WWW-Authenticate" in op["responses"]["401"].get("headers", {}), where
        if method not in SAFE and (method, path) not in UNAUTHENTICATED:
            assert "403" in codes, where
        if "{" in path and not path.endswith("/current"):
            assert "404" in codes, where
        if method == "delete":
            assert "204" in codes, where
        if method == "post" and (method, path) not in UNAUTHENTICATED:
            assert "201" in codes, where
        if op.get("parameters") or op.get("requestBody"):
            assert "422" in codes, where


def test_openapi_create_and_update_schemas_reject_extra_fields(spec: dict) -> None:
    schemas = spec["components"]["schemas"]
    requests = [name for name in schemas if name.endswith(("Create", "Update"))]

    assert len(requests) >= 10
    for name in requests:
        assert schemas[name].get("additionalProperties") is False, name


def test_openapi_check_in_put_documents_both_201_and_200(spec: dict) -> None:
    responses = spec["paths"]["/api/v1/habits/{habit_id}/check-ins/{day}"]["put"]["responses"]

    assert {"200", "201", "409", "422"} <= set(responses)


def test_openapi_member_read_has_no_credential_fields(spec: dict) -> None:
    fields = set(spec["components"]["schemas"]["MemberRead"]["properties"])

    assert fields == {"id", "nickname", "avatar_emoji", "role", "gem_balance", "gems_held"}
