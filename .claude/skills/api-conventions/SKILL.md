---
name: api-conventions
description: Load before adding, changing, reviewing or proposing any backend endpoint or route (/api/v1/...), FastAPI router, Pydantic request/response schema, status code or API error — including the API contract section of a spec or plan, and when deciding whether a new endpoint is needed. Conventions for the backend HTTP API.
---

# API conventions

## Rules

1. **Paths.** Every route lives under `/api/v1` and uses plural resource nouns (`/api/v1/members/{member_id}`, not `/api/v1/member` or `/api/v1/getMember`).
2. **Schemas.** Requests and responses use Pydantic models named `XCreate`, `XRead` and `XUpdate`; set `response_model` on every route. Never return ORM objects or raw dicts.
3. **Status codes.** `201` for create, `204` (empty body) for delete, `404` for a missing resource, `422` for validation errors. Declare them on the route.
4. **Errors.** Error bodies are always `{"detail": ...}` (raise `HTTPException`; no custom error envelopes).
5. **Dates.** Dates and datetimes are ISO-8601 and expressed in the family's timezone.
6. **Tests.** Every endpoint has a pytest API test covering a success case and at least one failure case (e.g. 404 or 422).
7. **Docs.** OpenAPI stays accurate: summaries, response models and status codes match actual behaviour.

## How to verify

Run the backend pytest suite; open `/docs` (or fetch `/openapi.json`) and check each new or changed route has the `/api/v1` prefix, the right `XCreate`/`XRead`/`XUpdate` schemas and declared status codes, and has a matching success + failure test.
