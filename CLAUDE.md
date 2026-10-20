# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is the project
Family Habit Tracker: households set shared and personal habits, check them off daily, and track streaks and gems.
- Backend: `backend/` — FastAPI + SQLModel on SQLite (Alembic migrations), uv, Python 3.14. Routes under `/api/v1`.
- Frontend: `frontend/` — Vite + React + TypeScript, Node 26. Vite proxies `/api` → `:8000` in dev;
  in prod FastAPI serves `frontend/dist` from the same origin.
- Tests: pytest (backend), Vitest + Testing Library (frontend), Playwright E2E in `e2e/` (from Phase 10).

## Commands
Run from the repo root. `make` loads `.env` (created from `.env.example` by `make setup`).

| Target | Healthy output |
|---|---|
| `make help` | list of targets with descriptions |
| `make check-tools` | `uv 0.13.1 · node v26.12.0 · npm 11.20.0` |
| `make setup` | `✅ SETUP DONE` |
| `make dev` | API on http://localhost:8000 (`/docs`), app on http://localhost:5173; Ctrl-C stops both |
| `make be-dev` / `fe-dev` | one server only, same ports |
| `make build` | `frontend/dist/` written, no tsc errors |
| `make lint` | see `verify` below (ruff, eslint, prettier, tsc) |
| `make be-lint` | `All checks passed!` · `7 files already formatted` |
| `make fe-lint` | eslint silent · `All matched files use Prettier code style!` · tsc silent |
| `make fmt` | files rewritten, exits 0 |
| `make test` | `test-backend` then `test-frontend` |
| `make test-backend` (`be-test`) | pytest + coverage, fails under 95%: `Required test coverage of 95% reached.` · `6 passed` |
| `make test-frontend` (`fe-test`) | Vitest + v8 coverage, fails under 90% lines/functions/branches (`vite.config.ts`): `Tests  5 passed (5)` · `Branches   : 100%` |
| `make coverage` | pytest `term-missing` table + v8 table, exits 0 |
| `make security` (`be-security` + `fe-security`) | `uv audit`: `Found no known vulnerabilities…` · bandit (app code only) silent · `npm audit --omit=dev`: `found 0 vulnerabilities` |
| `make api-types` | regenerates `frontend/src/api/schema.d.ts`; `git diff` empty if contract unchanged |
| `make e2e` | `e2e: no Playwright tests yet (Phase 10).` |
| `make seed-dev` | `seed-dev: nothing to seed yet (Phase 1 adds the data model).` |
| `make clean` | `rm -rf frontend/dist frontend/coverage backend/.pytest_cache …` |

`make verify` (lint + all tests + security; must pass before a PR) ends like this:
```
cd backend && APP_ENV=test uv run pytest -q --cov=app --cov-report=term-missing --cov-fail-under=95
......                                                                   [100%]
Name              Stmts   Miss Branch BrPart  Cover   Missing
-------------------------------------------------------------
TOTAL                32      0      2      0   100%
Required test coverage of 95% reached. Total coverage: 100.00%
6 passed in 0.03s
cd frontend && npx vitest run --coverage
 Test Files  1 passed (1)
      Tests  5 passed (5)
=============================== Coverage summary ===============================
Statements   : 100% ( 17/17 )
Branches     : 100% ( 6/6 )
Functions    : 100% ( 5/5 )
Lines        : 100% ( 14/14 )
================================================================================
cd backend && uv audit
Found no known vulnerabilities and no adverse project statuses in 74 packages
cd backend && uv run bandit -r app -q
cd frontend && npm audit --audit-level=high --omit=dev
found 0 vulnerabilities

✅ VERIFY PASSED
```

Single test:
- `cd backend && APP_ENV=test uv run pytest tests/test_health.py::test_name` (or `-k keyword`, `-m req`)
- `cd frontend && npx vitest run src/App.test.tsx -t "name"`

After changing a backend route or schema: run `make api-types` and commit `schema.d.ts` (CI fails if stale).

## How changes are made
AIDLC pipeline: **intent → spec → plan → code**. Each stage is a reviewed PR before the next starts.
- Each change lives in `changes/NNNN-slug/` with `intent.md`, `spec.md`, `plan.md`. See `changes/README.md`.
- Intent: written by a human, via the `write-intent` skill; status `draft` → `accepted`/`rejected`.
- Spec: testable REQ-NNN requirements with Given/When/Then, via `intent-to-spec`.
- Plan: files, ordered tasks, tests, risks, written to `plan.md` (not plan-mode approval).
- Code: PRs reference the change folder; each plan phase ends green and can be its own PR.
- Current change: `0001-family-habit-tracker` — REQ-001…REQ-028, phases 0–11, Phase 0 done.
  Read the plan's "Cross-cutting technical decisions" table before coding; don't re-decide them.
- Shipped changes get a row in `docs/metrics/scoreboard.md`.

## Conventions
- Python 3.14, FastAPI, SQLModel. Follow the `api-conventions` skill.
- Load `child-data-privacy` for models, endpoints and logging; `family-ux` for UI, copy and selectors.
- Never call `datetime.now()`; time comes from `app/clock.py` (ruff `DTZ` enforces this).
- Logs carry IDs only: no request bodies, query values, passcodes or PINs.
- TypeScript strict (the TS 6 default; don't relax it), React function components.
- API types come from `src/api/schema.d.ts`, never hand-written. User-facing strings live in `src/copy.ts`.
- Select elements in tests by role/label, never CSS classes.
- Don't add dependencies without asking.

## Architecture
- `backend/app/{models,routers,services}` — tables, HTTP routes, business logic.
  `create_app(settings)` in `app/main.py`; `Settings` read from env in `app/config.py`.
- `frontend/src/{pages,components,api}` — screens, shared UI, API client + generated types.
- `changes/` = intent/spec/plan per change.
- `docs/design/` = mockups (`docs/design/mvp/`: HTML plus PNGs per screen at 360/768/1440).

## Definition of done
- Every plan phase or bug fix that changes code adds unit tests for that change, then runs
  `make build` and `make verify`; both must pass.
- Then run `make coverage`: unit-test coverage must be at least 98% (backend and frontend). If it is lower,
  add unit tests and rerun `make build`, `make verify` and `make coverage` until it is back to 98% or higher.
- `make security` is clean. A real false positive gets `# nosec B<id>: <reason>` on that line and is mentioned
  in the PR. Never silence a finding without a reason.
- Run `make verify` and paste the output before saying a task is complete.
- If a test fails, fix the code, not the test.
- Update `plan.md` in the same commit if the implementation diverged.

## Tests
Unit / API (backend)
- pytest in `backend/tests/`, run with `APP_ENV=test`.
- `conftest.py` builds `create_app(settings)` with a temp SQLite file per test; use the `client` fixture.
- Freeze or advance time with the clock / `time-machine`, never real time.

Unit (frontend)
- Vitest + Testing Library on jsdom; files `src/**/*.test.{ts,tsx}`; setup in `src/test/setup.ts`.
- Query with `getByRole` / `getByLabelText`; drive with `user-event`.

E2E
- Playwright at the repo root (`package.json`, `playwright.config.ts`, specs in `e2e/`), added in Phase 10.
- `make e2e` is a placeholder until then; afterwards it joins `make verify`.
- Selectors follow `family-ux`: role/label only.

Requirements
- Tag every test with the REQ it proves: `@pytest.mark.req("REQ-011")` or `describe("REQ-011 …")`.
- Markers are strict (`--strict-markers`); an unknown marker fails the run.
- Each REQ needs tests at the layers listed in spec §7 (unit / API / E2E).
  `scripts/req_coverage.py` (planned) reports REQ × layer and runs in CI.
- Fixtures: family Dad 🦉 / Mum 🌻 / Mia 🐬 / Kavi 🦖, today = Tue 20 Oct 2026, `Europe/London`
  (per REQ-020, not the mockup data).

## Things Claude gets wrong
- _(none yet — add one line each time the same mistake happens twice)_
