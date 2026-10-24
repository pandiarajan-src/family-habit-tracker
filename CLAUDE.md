# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is the project
Family Habit Tracker: households set shared and personal habits, check them off daily, and track streaks and gems.
- Backend: `backend/` — FastAPI + SQLModel on SQLite (Alembic migrations), uv, Python 3.14. Routes under `/api/v1`.
- Frontend: `frontend/` — Vite + React + TypeScript, Node 26. Vite proxies `/api` → `:8000` in dev;
  in prod FastAPI serves `frontend/dist` from the same origin.
- Tests: pytest (backend), Vitest + Testing Library (frontend), Playwright E2E in `e2e/` (from Phase 10).

## Commands
Run from the repo root. `make` loads `.env` (created from `.env.example` by `make setup`). `make help` lists every target.

| Target | What it does |
|---|---|
| `make setup` | install backend and frontend deps from the lock files; ends `✅ SETUP DONE` |
| `make dev` | API on http://localhost:8000 (`/docs`) + app on http://localhost:5173; `be-dev` / `fe-dev` run one |
| `make fmt` | auto-fix lint issues and format all code |
| `make lint` | ruff, eslint, prettier, tsc, no changes made; `be-lint` also fails on `now()`/`today()` outside `app/clock.py` |
| `make be-test` / `fe-test` | one side's tests with its coverage gate; lists only files with missing lines |
| `make coverage` | full coverage tables for both sides |
| `make api-types` | regenerate `frontend/src/api/schema.d.ts` from the backend OpenAPI |
| `make migrate` | Alembic upgrade to head on `DATABASE_URL` (`be-dev` runs it too) |
| `make seed-dev` | sample family Dad/Mum/Mia/Kavi (passcode and PINs in `app/cli.py`) |
| `make verify` | lint + build + hook tests + all tests + security; ends `✅ VERIFY PASSED`, on failure read the first error |

`make verify` runs the hook tests (`make test-hooks`) only when `.claude/hooks`, `.claude/settings.json`,
the lock files or the lint config differ from `origin/main`.

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
- Current change: `0001-family-habit-tracker` — REQ-001…REQ-028, phases 0–11, Phases 0–8 done
  (update this line when a phase merges).
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
- `.claude/hooks/**` and `.claude/settings.json` are read-only for Claude (settings `deny`):
  propose the change and let the user apply it.

## Architecture
- `backend/app/{models,routers,services}` — tables, HTTP routes, business logic.
  `create_app(settings)` in `app/main.py`; `Settings` read from env in `app/config.py`.
- `frontend/src/{pages,components,api}` — screens, shared UI, API client + generated types.
- `changes/` = intent/spec/plan per change.
- `docs/design/` = mockups (`docs/design/mvp/`: HTML plus PNGs per screen at 360/768/1440).

## Definition of done
- Every plan phase or bug fix that changes code adds unit tests for that change.
- Coverage gates: backend 95%, frontend 90% lines/functions/branches. If lower, add tests; never lower a threshold.
- If a test fails, fix the code, not the test.
- While iterating, run the narrowest check: a single test, `be-test`/`fe-test`, `be-lint`/`fe-lint`.
- Run `make verify` **once**, after the last edit, and paste its last ~10 lines before saying a task is complete.
  Don't rerun it before `git commit` or `gh pr create` when no file changed since it passed.
- PR gate (`.claude/hooks/pre-pr-gate.py`): `gh pr create`/`gh pr ready` goes through if `make verify` already
  passed for the same file contents (committed or not); otherwise it runs `make verify` and blocks on failure.
  When blocked, fix the cause; never edit the hook or a threshold to get through.
- A real security false positive gets `# nosec B<id>: <reason>` on that line and is mentioned in the PR.
  Never silence a finding without a reason.
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
  Until then `make e2e` is a placeholder; afterwards it joins `make verify`.
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
