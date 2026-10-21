# Plan: Family habit tracker MVP (change 0001)

Change: `0001-family-habit-tracker` · Intent: [accepted](intent.md) · Spec: [approved](spec.md) (C1–C15 resolved, C16 minor) · **Status: Approved** · Date: 2026-10-20
Repo pipeline: intent → spec → **plan** → code.

## Context

The repo has an accepted intent, a detailed spec (REQ-001…REQ-028, data model, API contract, 9 screens with mockups in `docs/design/mvp/`) and project skills (`api-conventions`, `child-data-privacy`, `family-ux`), but `backend/`, `frontend/` and `e2e/` are empty. This plan builds the whole MVP in 12 phases: scaffold, backend foundation, a pure domain engine, the resource API, then one frontend phase per screen group, then E2E/non-functional checks and release. Each phase ends green (`make lint test`) and can be its own PR.

## Cross-cutting technical decisions

These apply to every phase. They are fixed here so phases don't re-decide them.

| Concern | Decision |
|---|---|
| Layout | `backend/` (uv, FastAPI, SQLModel), `frontend/` (Vite React TS), Playwright at the repo root (`package.json` + `playwright.config.ts`, specs in `e2e/`), root `Makefile`. |
| Prod serving | FastAPI serves the built `frontend/dist` as static files from the same origin. That gives one origin for cookies, CSRF and the CSP `default-src 'self'`. In dev, Vite proxies `/api` → `:8000`. |
| DB | SQLModel on SQLite (file DB locally, temp file per test). `PRAGMA foreign_keys=ON` on every connection (needed for the DB-level cascades in REQ-007), WAL mode, `busy_timeout`. All FKs declare `ondelete=CASCADE` / `SET NULL` exactly as in spec §3. Migrations with **Alembic** from the first table, because data is kept ≥ 13 months. |
| Time | One injectable `Clock` (`app/clock.py`) used for "now" and the family date. Tests freeze it; idle-timeout tests advance it. No `datetime.now()` anywhere else (ruff rule `DTZ` plus a grep check). |
| Earned gems | Earned gems are **derived** by pure functions in `app/domain/` from CheckIns, StreakSavers and WeeklyTargets (spec §3). Spends live in `GemTransaction`. Balance = earned + Σ transactions, floored at 0 with a `correction_writeoff` (REQ-014/021). |
| Concurrency | Check-in PUT uses `INSERT … ON CONFLICT(habit_id,date) DO NOTHING`, then a select: 201 if inserted, 200 if not (REQ-012). Gem spends (savers, claims) run in `BEGIN IMMEDIATE` and re-check the balance inside the transaction. |
| Sessions | Opaque 128-bit+ id in an HttpOnly, SameSite=Lax cookie; `Secure` comes from config (on in prod; off for http://localhost because WebKit drops Secure cookies there). Activity is updated only when the request lacks `X-Background-Refresh: 1` (spec §4 marker). |
| CSRF | Double-submit: `POST /sessions` sets a non-HttpOnly `csrf_token` cookie. The client echoes it in `X-CSRF-Token` on every non-GET request. The session dependency (`require_family`) returns `403` on a mismatch, after the session check, so a request with no session is always `401` (§7 NFR). |
| Hashing / limits | `argon2-cffi` (argon2id, RFC 9106 low-memory profile, `hashing.PARAMETERS`) for passcode and PINs. Tests swap in argon2's `CHEAPEST` profile via an autouse fixture; a unit test guards the production parameters. Passcode limiter: in-memory sliding window per client IP (10 per 15 min, REQ-001), valid while we run one uvicorn worker. PIN lockout is persisted on `MemberCredential` (REQ-003). |
| Privacy logging | A logging filter plus custom access-log format that never logs request bodies or query values. Logs carry IDs only. A log-capture test covers sign-in, failed sign-in, PIN entry and member creation [child-data-privacy #2]. |
| API types in FE | `openapi-typescript` generates `frontend/src/api/schema.d.ts` from `/openapi.json` (`make api-types`). CI fails if the generated file is stale, so the frontend can't drift from the contract. |
| FE data | A small `api/client.ts` (fetch wrapper: CSRF header, background flag, 403 → Family board) with 401 routing by `WWW-Authenticate` (spec §4 "Which `401`", C18): `FamilyPasscode` → Passcode entry with the idle note, `MemberPIN` → the wrong-PIN state where the PIN was typed. Plus `useQuery`-style hooks of our own: `useResource`, `usePolling(30s, onFocus)`. |
| FE styling | Plain CSS with tokens (`styles/tokens.css`), CSS modules per component, fluid/grid layouts, a 44px minimum target size, a visible `:focus-visible` ring. Nunito is bundled via `@fontsource/nunito`, with no external fonts [child-data-privacy #5]. |
| Copy | Every user-facing string lives in `frontend/src/copy.ts`. A lint test fails on "failed", "missed" or "bad" [family-ux #6]. |
| REQ traceability | Tests are tagged `@pytest.mark.req("REQ-011")` or `describe("REQ-011 …")`. `scripts/req_coverage.py` lists every REQ × layer (unit/API/E2E) against spec §7 and runs in CI. |
| Test fixtures | Sample family Dad 🦉 / Mum 🌻 / Mia 🐬 / Kavi 🦖, with "today" = Tue 20 Oct 2026 in `Europe/London`. Fixtures follow REQ-020, **not** the mockup data (C16 option a). |

---

## Phase 0 — Scaffold and tooling

**Files that change**
- `backend/pyproject.toml`, `backend/uv.lock`: FastAPI, SQLModel, uvicorn, alembic, argon2-cffi, tzdata; dev: pytest, httpx, pytest-cov, ruff, time-machine.
- `backend/app/{__init__,main,config}.py` (`create_app()`, `GET /api/v1/health`, settings via env), `backend/tests/test_health.py`.
- `backend/ruff.toml` (lint + format, rules incl. `DTZ`, `S`, `B`, `UP`, `I`).
- `frontend/` via `npm create vite@latest -- --template react-ts`, then `react-router`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `eslint` (typescript-eslint, react-hooks, jsx-a11y), `prettier`, `@fontsource/nunito`, `openapi-typescript`.
- `frontend/vite.config.ts` (proxy `/api` → `http://localhost:8000`, Vitest `environment: 'jsdom'`, setup file), `frontend/src/test/setup.ts`, `eslint.config.js`, `.prettierrc`.
- `Makefile`: `setup`, `dev` (both servers), `be-dev`, `fe-dev`, `lint`, `fmt`, `test`, `be-test`, `fe-test`, `api-types`, `e2e` (placeholder until Phase 10), `seed-dev`.
- `.github/workflows/ci.yml`: backend lint + test, frontend lint + typecheck + test, api-types freshness check.
- `README.md`: a "Run locally" section.

**Order of work:** backend uv project → health route + test → ruff → frontend Vite app → Vitest/RTL smoke test → ESLint/Prettier → Vite proxy (check the FE fetches `/api/v1/health` in dev) → Makefile → CI.

**Tests that prove it works:** `make lint test` green; `test_health` (200, `/api/v1` prefix [api-conventions #1]); a Vitest smoke test renders `<App/>`; manual check that `make dev` loads the app and the proxied health call succeeds.

**Risks:** Node/uv versions drift between machines. Mitigation: pin with `.nvmrc`/`engines` and `requires-python`, and use `uv sync --frozen` and `npm ci` in CI.

---

## Phase 1 — Backend foundation: data model, sessions, access control

**Files that change**
- `backend/app/db.py`: engine, FK/WAL pragmas, `get_db` dependency, `transaction(immediate=True)` helper. *As built:* SQLAlchemy issues BEGIN itself (pysqlite's auto-BEGIN off, the documented SQLite recipe), so `immediate=True` emits `BEGIN IMMEDIATE`.
- `backend/app/clock.py`: `Clock` protocol, `SystemClock`, `FrozenClock` (tests), and `family_today(tz)`.
- `backend/app/models/`: one module per spec §3 entity. Every family-owned table has `family_id`. *As built:* Phase 1 adds only the access-control tables (`family`, `member`, `credential`, `session` → `DeviceSession`); the rest (`habit`, `weekly_target`, `check_in`, `streak_saver`, `gem_transaction`, `prize`, `prize_claim`, `adjustment`) land in Phase 3 with their own migrations and tests. The session row stores a SHA-256 of the cookie value, not the value.
- `backend/migrations/` + `alembic.ini`: the initial migration (`0001_access_control`). `app.db.upgrade_to_head(url)` runs it from code; `make migrate` (also run by `make be-dev`).
- `backend/app/security/`: `hashing.py`, `sessions.py` (the `require_family`, `require_member`, `require_parent` dependencies; idle expiry; background-refresh handling), `csrf.py`, `rate_limit.py`, `headers.py` (CSP, HSTS, `X-Content-Type-Options`), `log_redaction.py`. *As built:* the CSRF check runs inside `require_family` (after the session check) rather than as middleware, so a request with no session is always `401`. `/docs` and `/redoc` are off when `APP_ENV=prod` (they load a CDN, [child-data-privacy #5]) and get a relaxed CSP elsewhere. `app/errors.py` strips submitted `input` values from 422 bodies so passcodes/PINs are never echoed.
- `backend/app/routers/sessions.py` (POST/GET/PATCH/DELETE `/sessions[/current]`) and `families.py` (GET/PATCH `/families/current`).
- `backend/app/schemas/{session,family,member}.py` (`MemberRead` without credential fields, `extra="forbid"` on every `*Create`/`*Update`).
- `backend/app/cli.py`: `uv run python -m app.cli setup-family` / `make setup-family` (prompts for passcode and first parent PIN without echo, so they stay out of shell history) and `seed-dev` / `make seed-dev`. *As built:* no `fht` console script, because that needs a build backend in `pyproject.toml` (a new dependency).
- `backend/tests/conftest.py` + `tests/support.py`: temp DB, frozen clock, seeded family, and `anon` / `unlocked` / `as_parent` / `as_child` / `make_client` fixtures.

**Order of work:** db + clock → models + migration → hashing → `setup-family` CLI → session create (passcode, limiter, cookies) → `require_*` dependencies + idle expiry → PATCH session (PIN, lockout) → DELETE session → families → security headers + CSRF check → log redaction + log-capture test.

**Tests that prove it works**
- REQ-001: correct passcode → 201 + cookie flags; wrong → 401; 11th attempt → 429 even with the right passcode; no cookie on every data route → 401 (a parametrised test over `app.routes`); captured logs contain no passcode.
- REQ-002: parent DELETE → 204, replayed cookie → 401; child → 403.
- REQ-003: correct PIN sets the acting member; wrong → 401; 6th → 429 for member A only (member B still works); a write with no acting member → 403; logs show IDs only.
- REQ-004: with the clock advanced past 5 idle min, reads and writes → 401. The acting member and the family session share one 5-minute idle timer, so the session has always ended too, and REQ-028 makes a missing session 401. Spec REQ-004 updated to match (C17); a write after "Done — switch person" → 403. Every 401 names its challenge: wrong PIN → `MemberPIN`, no/ended session (also during PIN entry) → `FamilyPasscode` (C18, `tests/api/test_auth_challenges.py`). Background-refresh requests don't extend expiry; a person-initiated request at 4 min does. Two clients act as different members.
- REQ-027: GET/PATCH timezone; a bad IANA name → 422; datetimes carry the family offset; unit tests for family dates across DST and midnight.
- REQ-028 (scaffold): an other-family ID → 404 helper (`get_owned_or_404`). *As built:* the permission-matrix unit table moved to Phase 2 with `app/domain/permissions.py`.
- Unit (spec §7) *as built:* `tests/unit/` covers hashing and the limiter window (REQ-001), the PIN lockout counter (REQ-003), idle-timeout and background-refresh rules (REQ-004), and family dates (REQ-027). `tests/test_db.py` covers the pragmas, a DB-level cascade and `transaction()`. `make be-lint` greps for `now()`/`today()` outside `app/clock.py`.
- NFR: CSP and HSTS headers present; cookie `HttpOnly; SameSite=Lax` (+`Secure` under prod settings); a missing CSRF token → 403.
- Cross-cutting: a schema test that `MemberRead` exposes only `id, nickname, avatar_emoji, role, gem_balance, gems_held` [child-data-privacy #1].

**Risks**
- SQLite ignores FKs unless the pragma is set on every connection, so cascades would silently fail. Mitigation: a connect-event listener plus a test that asserts `PRAGMA foreign_keys` = 1.
- An activity rule mixed up between family session and acting member. Mitigation: two separate timestamps, as in spec §3, and explicit clock-driven tests.
- The in-memory passcode limiter resets on restart and breaks with more than one worker. Accepted for v1 (one worker). Phase 11 pins `--workers 1` in the Dockerfile and states the limit in `docs/runbook.md`; the code says so in `app/security/rate_limit.py`.
- Secure-cookie behaviour differs between dev and prod. Covered by a config-specific test.

---

## Phase 2 — Domain engine: streaks, gems, savers, balance (pure functions)

No DB and no FastAPI. Inputs are plain dataclasses (dates of check-ins, saved periods, target history, today).

**Files that change**
- `backend/app/domain/dates.py`: family date, ISO week Monday, a week range. *As built:* `clock.family_today` now calls `dates.family_date`, so the timezone conversion lives in one place.
- `backend/app/domain/weekly_targets.py`: target in effect for a given week (REQ-009). *As built:* also `change_target()` (a new target counts from this week; a second change in the same week replaces the first) and 1–7 / Monday validation on `TargetChange`.
- `backend/app/domain/streaks.py`: daily and weekly current/best streak, today-pending rule, week completion. *As built:* one period timeline (`DONE`/`SAVED`/`OPEN`/`PENDING`) split into runs, which gems and savers reuse so all three agree. Inputs are `DailyHistory` / `WeeklyHistory` (dates and Mondays only, no titles). Archive freezes the streak (pass the archive date as `today`); unarchive restarts it (`restart_on`, C20).
- `backend/app/domain/gems.py`: daily earn events (1 per habit-day; +5 when n mod 7 = 5, +7 when n mod 7 = 0) and weekly earn events (1 per complete week; +5 every 5 weeks). Returns *dated events*, which are also used for the REQ-021 history. *As built:* `EarnKind` has the five derived kinds from the Phase 8 note (`daily_checkin`, `daily_bonus_5`, `daily_bonus_7`, `weekly_goal`, `weekly_bonus_5`); a week's events are dated on the check-in day that reached its target.
- `backend/app/domain/savers.py`: saveable periods (past only, ≤ 7 days, must follow a done/saved period; for weekly habits, the most recent past week below target) and the rising cost within a run. *As built:* a weekly saver also needs the week before it complete or saved (the "same rule, per week" of spec §8 Q3); a saver that joins two runs costs 1 + the savers in both (C21).
- `backend/app/domain/balance.py`: available = earned + transactions, a write-off amount when negative, and the held amount. *As built:* plus `can_afford()` and `gems_to_go()` ("12 more gems to go!").
- `backend/app/domain/permissions.py`: the matrix from REQ-028 (actor role, owner role, self, action → allowed). *As built:* `Role` moved here and `app/models/member.py` imports it, so there is one definition. Check-ins outside today/yesterday are a separate `CHECK_IN_CORRECTION` action (parent → child only), so Phase 3 can tell `403` (not allowed) from `422` (own habit, outside the window). `CLAIM_DECIDE` takes the family's parent count (REQ-026).
- `backend/app/domain/day_states.py`: Done / Saved / Not yet; week state Complete / Saved / In progress x of N / Coming up (REQ-023, C13). *As built:* days after today or before `created_on` have no state (blank, as in the Month view mockup); a past week below target is `below_target` (C19); a complete week shows as complete even if it was saved (C21).
- `backend/tests/unit/test_*.py` for each module. *As built:* shared dates in `tests/unit/domain_support.py`; `test_domain_purity.py` fails if a domain module imports the DB, FastAPI, SQLModel, the clock or `logging`.

**Order of work:** dates → weekly targets → streaks → gems → savers → balance → permissions → day states.

**Tests that prove it works (unit)**
- REQ-016: runs, saved day bridges without counting, today pending, a gap before yesterday ends the run, best streak.
- REQ-017: week completion with a changing target; an in-progress week doesn't break the run; Sunday 23:30 vs Monday 00:00 in the family timezone.
- REQ-018: a day 1–30 table (5→+5, 7→+7, 12→+5, 14→+7, 19, 21 …); 3 habits → 3 gems/day; a backfill that joins two runs recomputes the bonuses.
- REQ-019: bonuses at weeks 5, 10, 15; no 7-week bonus; a week dropping below target removes its gem and bonus.
- REQ-020: the 7-day window, the must-follow rule, cost 1, 2, 3 within a run and back to 1 in a new run, the weekly variant, today not saveable.
- REQ-021 / REQ-014: balance never below 0; write-off amount; earning after a write-off → 1.
- REQ-023: day-state mapping; weekly never per-day "Saved"; today never "Saved".
- REQ-028: the permission-matrix table.
- *As built:* also REQ-009 (target in effect per week; archive freezes, unarchive restarts) and REQ-025 (affordability, gems to go). New ambiguities went to spec §9 as C19–C21 with the default the engine uses.

**Risks:** rule ambiguity at edges (for example a saver after a saved day, or a target change mid-run). Mitigation: table-driven tests that quote the spec line, and any new ambiguity goes back to the spec as a question instead of being guessed. Performance: recomputation is O(habits × days), about 4 × 20 × 400. That's trivial, so no caching.

---

## Phase 3 — Backend resource API

**Files that change**
- `backend/app/schemas/{member,credential,habit,check_in,streak_saver,gem_transaction,prize,prize_claim,adjustment}.py`. *As built:* plus `schemas/fields.py` (shared `Nickname`, `AvatarEmoji` (one emoji grapheme, no new dependency), `Pin`, `Title`, `GoalNote` types). `HabitRead` also has `created_on` and `streak_pending` ("Check in today to make it 4!"); `week_progress` is `{done, target, complete}` with the raw count; `next_saver_cost` is the cheapest saveable period now. `StreakSaverRead` also has `member_id`. `GemTransactionRead.kind` covers the five derived earning kinds plus the four ledger kinds (decision 3 below, confirmed).
- `backend/app/models/{habit,check_in,streak_saver,gem_transaction,prize,adjustment}.py` and migration `0002_habits_gems_prizes` (*as built*; Phase 1 deferred these tables here). `Habit.restarted_on` stores the last unarchive date for C20. `PrizeClaim` also carries `family_id` so claims are family-scoped like every other row. `GemTransaction.streak_saver_id` is `SET NULL`, not `CASCADE`: deleting a habit deletes its savers, but spent gems stay spent (REQ-009, C22). `tests/test_migrations.py` checks the migrations match the models and downgrade cleanly.
- `backend/app/services/`: transactional operations that call the domain engine. `habits.py` (20-habit limit, archive/unarchive, delete + reconcile), `check_ins.py` (window, idempotent PUT, undo, parent correction + reconcile + adjustment), `savers.py` (eligibility, `BEGIN IMMEDIATE` spend), `balance.py` (load inputs, `reconcile_writeoff()` after any write that lowers earnings), `claims.py` (hold, release, approve, decline, cancel, approver rule), `members.py` (last-parent guard, cascade delete), `adjustments.py` (record IDs only). *As built:* plus `context.py` (`Ctx`: db, family, timezone, now, acting member). Prizes live in `claims.py`; gem history is `balance.gem_history()`. Every write runs in `transaction(immediate=True)`. `reconcile_writeoff()` runs after a check-in removal, a habit delete, a habit edit (a higher target can drop this week below it) and a saver (joining runs moves bonuses). `app/db.py` gains `insert_if_absent()` (the `ON CONFLICT DO NOTHING` helper) and sessions with `expire_on_commit=False`; `require_family` now runs as one `BEGIN IMMEDIATE` transaction that ends before the route, so two devices updating activity at once can't hit SQLite's busy-snapshot error. `ensure_allowed()` in `app/security/sessions.py` turns the Phase 2 permission matrix into 403s.
- `backend/app/routers/{members,habits,check_ins,streak_savers,prizes,prize_claims,adjustments}.py`. Every route declares `response_model`, `status_code`, `responses=` and `summary` [api-conventions #2/#3/#7]. *As built:* plus `routers/deps.py` (`FamilyCtx`/`MemberCtx` dependencies, shared response docs). `POST /habits` with a member from another family (or unknown) returns 404, declared, like every other ID (REQ-028). `DELETE …/check-ins/{date}` with nothing to undo is a 204 no-op, so an undo racing a check-in leaves the last request's state (REQ-012). Check-ins and savers on an archived habit are 422 (C23). Nicknames are unique ignoring case.
- `backend/tests/api/test_*.py`: one file per router; `tests/api/test_openapi.py`; `tests/api/test_privacy.py`. *As built:* `test_members`, `test_credentials`, `test_habits`, `test_check_ins`, `test_concurrency`, `test_streak_savers`, `test_gems` (balances, history, write-offs), `test_prizes` (prizes and claims), `test_adjustments`, `test_access_matrix` (REQ-028 sweep with positive controls), `test_openapi`, plus `tests/unit/test_schemas.py`. `tests/support.py` gains a `Seeder` that writes long histories straight to the DB. `tests/api/conftest.py` checks every API test's server logs for nicknames, titles, passcodes and PINs; the test settings now log at DEBUG, because at WARNING the app's INFO lines never reached the capture and the Phase 1 log tests checked nothing at INFO.

**Order of work (vertical by dependency):** members + credentials (REQ-005/006/007) → habits (REQ-008/009/010) → check-ins (REQ-011/012/013/014) → `GET /check-ins`, `GET /streak-savers` (REQ-023 ranges) → streak savers (REQ-020) → balance fields in `MemberRead` + gem-transactions (REQ-021) → prizes (REQ-024) → claims (REQ-025/026) → adjustments (REQ-015) → OpenAPI and privacy sweeps.

**Tests that prove it works (API, one success + one failure per endpoint minimum [api-conventions #6]):** follow spec §7's API column exactly, including:
- REQ-005: self-set with current PIN → 204; missing → 422; wrong → 401 with `WWW-Authenticate: MemberPIN` and 5 wrong → 429; parent reset → 204 + adjustment + lockout cleared; child sets another member's PIN → 403; `12a4` → 422.
- REQ-006: create → 201; extra `birthdate` → 422; duplicate nickname → 422; child changes a role → 403; demoting the last parent → 422.
- REQ-007: delete → 204, then **raw SQL** shows no check-ins, habits, savers, transactions, claims, credential or adjustments for the member; actor columns are null; last parent → 422 and nothing deleted; unknown → 404.
- REQ-008/009/010: create daily/weekly; a weekly habit without a target → 422; 21st → 422; rename keeps the streak; archive/unarchive; delete recalculates earned gems while spent gems stay; parent → child habit → 200 + adjustment; parent → other parent → 403.
- REQ-011/012/013: PUT today → 201, repeat → 200 with the same id; DELETE → 204 and gems revert; **two concurrent PUTs** (threads against a file DB) → one row; concurrent PUT/DELETE → balance consistent with the final state; yesterday → 201; 2 days ago, future, or before `created_on` → 422; PUT on a saved day → 409.
- REQ-014: parent backfills a child 30 days back → 201 + adjustment; parent edits the other parent's old day → 403; removing check-ins after spending → balance 0 + one `correction_writeoff`; next check-in → 1; re-adding → gems back, write-off kept.
- REQ-015: list newest-first within 12 months; a parent's own list is empty; target ack → 200; another member's ack → 403.
- REQ-016–019: `HabitRead` streak/progress fields and member balances match scripted fixture histories.
- REQ-020: 1st saver cost 1, 2nd cost 2; insufficient → 409 with unchanged balance; today, 8 days back or after a gap → 422; parent saves for a child → adjustment; **two concurrent spends** can't overspend.
- REQ-021: history includes derived earnings, holds and write-offs; another child → 403; held shown separately.
- REQ-022: GET members/habits with a family session and no acting member → 200.
- REQ-023: range > 62 days → 422; data from 12 months back returned.
- REQ-024/025/026: CRUD + 403 for a child; delete with a pending claim → 409; a cost edit doesn't change a pending claim; claim → hold; short → 409; cancel → release; approve → spent; decline → released; own claim with 2 parents → 403, with 1 parent → 200; not pending → 409.
- REQ-028: a parametrised sweep over every write route: no session → 401, no acting member → 403, wrong role → 403, other-family ID → 404.
- Cross-cutting: OpenAPI test (every path starts with `/api/v1`, every operation has a response model and declared codes); log-capture across the whole API suite contains no fixture nicknames, titles, passcodes or PINs.
- *As built:* the concurrency tests and the log guard were each checked by breaking the code on purpose (dropping `immediate=True` from the saver spend; logging a nickname) and seeing the test fail. Coverage after Phase 3: every Phase 3 module at 100% lines and branches; backend total 99%.

**Risks**
- Write-off reconciliation forgotten on one write path (habit delete, check-in removal, member delete is moot). Mitigation: every earning-lowering service calls `reconcile_writeoff()` in the same transaction, and a test is parametrised across those paths.
- SQLite concurrency tests can be flaky. Mitigation: use a file DB, a thread pool, and `busy_timeout`, and assert the end state, not the timing.
- Phase 3 is the largest phase. It can be split into 3a (members, habits, check-ins, savers) and 3b (prizes, claims, adjustments) as separate PRs.

---

## Phase 4 — Frontend shell and access flow (Passcode → Family board → PIN pad)

**Files that change**
- `frontend/src/api/{client.ts,schema.d.ts,hooks.ts}`: fetch wrapper (CSRF, `X-Background-Refresh`, error mapping), `useResource`, `usePolling`.
- `frontend/src/auth/{SessionProvider.tsx,useIdleTimer.ts,RequireFamily.tsx,RequireMember.tsx,RequireParent.tsx}`.
- `frontend/src/App.tsx`: all routes registered now, with placeholder screens for later phases (so Phases 5–9 don't edit the router).
- `frontend/src/components/{AppHeader,Tabs,PinPad,MemberCard,Button,Notice}.tsx` + CSS modules; `styles/tokens.css`; `copy.ts`.
- `frontend/src/screens/{PasscodeEntry,FamilyBoard}.tsx`; `frontend/src/test/{renderWithProviders.tsx,mockApi.ts}`.
- *As built (files):* the PIN pad is its own route, `/pin/:memberId` (`screens/PinEntry.tsx` around `components/PinPad.tsx`), so the browser Back button returns to the board. The session context and `useSession()` live in `auth/useSession.ts`, apart from `SessionProvider.tsx`, because the react-refresh lint rule keeps hooks and components in separate files. `api/endpoints.ts` holds one typed function per endpoint and `api/types.ts` gives short names to the generated types. Extra components: `Icon` (the design system's line icons, flame, gem and brand mark), `Badges` (streak, gems), `MemberChip`, `ProgressRing`, `HabitSummary` (the board's read-only habit card), `Loading`, `ComingSoon`, `MemberLayout` (header + tabs + `Outlet`). Helpers: `lib/{board,format,useNow}.ts`; tests also use `test/{fixtures.ts,LocationProbe.tsx}`. Placeholder screens already sit at their final paths (`screens/{MyDay,MyHabits,HabitEditor,MyPin,GemsPrizes}.tsx`, `screens/history/History.tsx`, `screens/parent/{ParentTabs,Approvals,FamilySettings}.tsx`), so Phases 5–9 replace a file's body and never edit `App.tsx`. Styling follows the Claude Design canvas (design system "Family Habit Tracker"): its tokens are in `styles/tokens.css`, including the dark palette under `prefers-color-scheme`, and Nunito 500–800 comes from `@fontsource`. Habits have no icon field, so the mockup's per-habit emoji are left out (the spec wins). No new dependencies.
- *As built (decisions):* the client idle timer restarts on each request a person triggers (the activity the server counts, REQ-004), not on every tap, so the device never looks signed in after the server has ended the session. A 403 re-reads `GET /sessions/current` as a background request, and the route guards then follow the answer (for example, to the board when nobody is acting); a single refused write doesn't throw anyone out. A wrong PIN clears the pad as REQ-003 says, where the mockup keeps the dots filled. On the board a weekly habit counts as done today if it was checked in today or its week is already complete, and "Longest" compares a weekly streak as 7 days per week, shown in weeks. The member panel also shows each habit's best streak (REQ-022), which the mockup lacks, and it is always view only. The CSP blocks inline `style` attributes, so the progress ring uses SVG attributes and nothing sets `style`.
- *Found while building:* a member who waits out a full 5-minute PIN lockout without touching anything is signed out by the 5-minute idle timeout too. That is REQ-004 working as written; a test covers it, and the lockout-countdown test uses a shorter `Retry-After`. Serving `frontend/dist` from FastAPI (cross-cutting decision) will need an `index.html` fallback for deep links such as `/my-day`; that lands with the Phase 11 serving work.

**Order of work:** tokens/fonts/copy → API client + generated types → SessionProvider + route guards → Passcode entry (error, 429 wait, idle-note states) → Family board (cards, view-only member panel, 30 s polling + on focus as background) → PIN pad (labelled digits, keyboard entry, wrong/lockout states) → app header + tabs (Parent tab only for parents) → client idle timer (5 min → clear, show Passcode with the note).

**Tests that prove it works (Vitest + RTL, role/name queries only)**
- REQ-001: Unlock posts the passcode; 401 shows "That passcode didn't work — try again"; 429 disables Unlock and shows the wait copy.
- REQ-003: tapping a card opens "Enter Mia's PIN"; digits work by click and keyboard; a 401 `MemberPIN` clears the pad and shows "Not quite — have another go", while a 401 `FamilyPasscode` goes to Passcode entry; 429 shows the ask-a-parent copy and disables the keypad.
- REQ-004: "Done — switch person" → board; the idle timer (fake timers) → Passcode with "You were signed out to keep things safe. Unlock to carry on!"; polling requests carry `X-Background-Refresh: 1`.
- REQ-022: cards show "3 of 5 done today", longest streak and gems; a child viewing a sibling sees no edit controls.
- REQ-028: Parent tab hidden for a child.
- Copy lint test over `copy.ts`.

**Risks:** the client timer and server expiry disagree. Mitigation: the server is the authority; a 401 `FamilyPasscode` or a 403 from the API also routes to Passcode/board, and the timer is only a UX nicety. Polling must never refresh activity, so the background flag is set in exactly one place (`usePolling`).

---

## Phase 5 — My day (vertical slice: check-off, undo, yesterday, savers, notices)

**Files that change:** `frontend/src/screens/MyDay.tsx`, `components/{HabitRow,StreakBadge,GemCounter,SaverPrompt,AdjustmentNotice,DayToggle}.tsx`, their tests, `copy.ts` additions. No backend changes expected; if one is needed, it goes to Phase 3 first.

**Order of work:** list today's habits (daily + weekly "2 of 3 this week") → `"Check off <title>"` → "Done ✓ — Undo" with optimistic update, then refetch of the habit + balance → Today/Yesterday toggle → saver prompt ("Save your streak for 2 gems?", 409 → kind not-enough copy) → parent-change notice + "Got it" → daily summary with balance.

**Tests that prove it works (RTL):** REQ-011 (1 tap from My day; Enter/Space works; focus stays visible), REQ-012 (a repeat 200 renders the same state, no double count), REQ-013 (Yesterday toggle sends yesterday's date), REQ-015 (notice text "Mum updated Reading for Tue 14 Oct", Got it → PATCH ack), REQ-016/017 ("Check in today to make it 4!", streak and best), REQ-018 (gem count updates), REQ-020 (accessible name "Use a streak saver for Reading on Tue 14 Oct"; the 409 copy contains no "missed"/"failed").

**Risks:** an optimistic UI hiding server truth in a double-tap race. Mitigation: disable the button while the request is in flight and reconcile from the response. Notice text needs nicknames and titles that the adjustment API returns only as IDs. Mitigation: join on the client against the already-loaded members and habits (keeps REQ-015's ID-only storage).

---

## Phase 6 — History: week and month at a glance

**Files that change:** `frontend/src/screens/history/{History,WeekView,MonthView}.tsx`, `components/{DayChip,WeekStateBadge,MonthCalendar,MemberFilter,PeriodNav}.tsx`, `frontend/src/lib/dayStates.ts` (mirrors `app/domain/day_states.py`, or uses `HabitRead` fields where present), tests.

**Order of work:** data loading (`/check-ins` + `/streak-savers` for ≤ 62-day windows, `/habits?include_archived`) → day-state mapping → Week view (≥ 768px grid; at 360px the stacked name/state + 7 wrapping chips, C12) → weekly-habit week badge (C13) → Month view + month picker for 12 months → per-member totals → member filter.

**Tests that prove it works:** REQ-023 unit (state mapping; weekly never per-day "Saved"; today never "Saved"; "5 of 3" shows as "Week complete"); RTL (Week/Month toggle; previous/next; navigate back 12 months requests the right ranges, none above 62 days; every chip has a text label); REQ-017 week states; REQ-009 (an archived habit appears in History only).

**Risks:** the client and server disagree about states. Mitigation: shared fixture JSON used by both the pytest `day_states` and Vitest `dayStates` tests. The 360px layout is the riskiest part; it gets an E2E `scrollWidth` check per card in Phase 10.

---

## Phase 7 — My habits, Habit editor, My PIN

**Files that change:** `frontend/src/screens/{MyHabits,HabitEditor,MyPin}.tsx`, `components/ConfirmDialog.tsx`, tests.

**Order of work:** list active and archived ("5 of 20 active habits", "Bring back") → editor (Title ≤ 40, Goal note ≤ 60, Daily/Weekly, Times per week, "A new target counts from this week") → archive → delete with confirmation → parent mode via `?member=<id>` with the banner (C15) → My PIN (current, new, confirm checked in the browser only).

**Tests that prove it works:** REQ-008 (create a weekly "Piano, 3 times a week"; field limits; the 20-limit message from 422), REQ-009 (archive/unarchive; delete confirmation copy), REQ-010 (banner shown and requests target the child's `member_id`), REQ-005 (mismatch shows "Those two PINs don't match yet — try typing the new one again" and **no request sent**; 401/429 states).

**Risks:** parent mode must never be reachable for another parent. The API enforces this (REQ-010); the UI only links from Family settings for children.

---

## Phase 8 — Gems & prizes (member view)

**Files that change:** `frontend/src/screens/GemsPrizes.tsx`, `components/{BalanceCard,GemHistory,PrizeList,ClaimList,ChangesList}.tsx`, tests.

**Order of work:** balance + "N gems waiting for approval" → earning/spending history (incl. 5- and 7-day bonuses) → prizes with `"Claim <prize>"` or "12 more gems to go!" → my claims + Cancel claim → "Changes to my habits" (12 months).

**Tests that prove it works:** REQ-021 (balance + held), REQ-025 (claim → pending; short shows remaining gems instead of an enabled button; cancel), REQ-026 (approved / "Not this time — your gems are back." states), REQ-015 (changes list newest first).

**Risks:** low. The derived history must label bonus events clearly. `GemTransactionRead` needs an event-kind enum that covers derived earnings (`daily_checkin`, `daily_bonus_5`, `daily_bonus_7`, `weekly_goal`, `weekly_bonus_5`); confirm this in Phase 3.

---

## Phase 9 — Parent tab: Approvals & prizes, Family settings

**Files that change:** `frontend/src/screens/parent/{ParentTabs,Approvals,FamilySettings}.tsx`, `components/{PrizeForm,MemberForm,RemoveMemberDialog,TimezoneSelect}.tsx`, tests.

**Order of work:** Approvals (pending claims; Approve / Not this time; own claim "Waiting for the other parent", or buttons in a one-parent family) → prize add/edit/delete (Delete disabled while a claim waits) → Family settings members (add/edit/remove with the cascade-listing confirm; "A family always needs at least one parent") → `"Reset <child>'s PIN"` → `"<child>'s habits"` link → timezone (`Intl.supportedValuesOf('timeZone')`) → "Sign this device out" → History parent correction for a child's past day (REQ-014; adds a parent-only action to Phase 6's DayChip).

**Tests that prove it works:** REQ-024, 026 (two-parent vs one-parent rendering), REQ-006 (add a child member; duplicate nickname error), REQ-007 (confirm lists what is deleted), REQ-005 (parent reset needs no current PIN), REQ-027 (timezone save), REQ-002 (sign out → Passcode), REQ-014 (parent toggles a child's past day), REQ-028 (rendered only for parents).

**Risks:** the REQ-014 correction UI touches Phase 6 files (`DayChip`, `WeekView`). Schedule it after Phase 6 merges, or move it into Phase 6. Removing a member is irreversible, so the confirm dialog must require an explicit second action.

---

## Phase 10 — E2E and non-functional verification

**Files that change**
- Root `package.json`, `playwright.config.ts`: projects for Chromium, Firefox and WebKit × viewports 360/768/1440. `webServer` starts the backend in `APP_ENV=e2e` with a fresh seeded DB and serves the built frontend.
- `backend/app/routers/test_support.py`: mounted **only** when `APP_ENV=e2e`, excluded from OpenAPI, with a unit test proving it's absent in prod. It provides reset+seed and clock-advance.
- `e2e/fixtures.ts` (unlock, pick member, `expectNoHorizontalScroll`, axe helper via `@axe-core/playwright`), `e2e/*.spec.ts` per screen.
- `scripts/check_no_trackers.py` (scans `package.json` deps and built HTML for external hosts), `scripts/load_checkin.py` (p95 check-in latency), `Makefile e2e` target, CI e2e job.

**Order of work:** config + webServer + seed → helpers → the 60-second flow → one spec per screen → cross-device spec (2 contexts) → idle timeout via clock advance → axe + scroll checks on every screen → perf (throttled 4G and CPU) → tracker/CSP checks → `req_coverage.py` showing every E2E cell from spec §7.

**Tests that prove it works (spec §7 E2E column):** REQ-001/002/003/004 (unlock, wrong passcode, PIN by keyboard and touch, switch person, idle → Passcode, two contexts), REQ-005 (change PIN; parent reset then the child unlocks), REQ-006/007, REQ-008/009/010, REQ-011 (≤ 2 taps, keyboard-only, **timed passcode + PIN + check-off < 60 s**), REQ-012 (two contexts; board updates within 30 s), REQ-013, REQ-014, REQ-015, REQ-016–018, REQ-020, REQ-021, REQ-022 (360px single column), REQ-023 (12 months back; text labels; per-card `scrollWidth <= clientWidth` at 360), REQ-024–026, REQ-028. Every screen: `scrollWidth <= innerWidth`, zero serious/critical axe violations. Selectors are role + name only [family-ux #7].

**Risks**
- Flaky time-dependent tests. Mitigation: the server clock is controlled through the test-support router, and the browser uses Playwright `page.clock`.
- The test-support router is a security risk if it leaks to prod. Mitigation: an env guard, a prod-config test, and the OpenAPI check.
- WebKit cookie behaviour on localhost. Mitigation: `Secure` stays off in e2e config.
- The 3 browsers × 3 viewports matrix is slow. Mitigation: run the full matrix on `main` and Chromium × 3 viewports on PRs.

---

## Phase 11 — Release: hosting, HTTPS, smoke test

**Files that change:** `Dockerfile` (multi-stage: build the frontend, then a uv runtime serving the API + `dist`; the command pins `uvicorn --workers 1`), `deploy/` config for the chosen host, pinned to **one instance**, `docs/runbook.md` (setup-family, running migrations, no backups per C11, and a "One worker, one instance" section: the passcode limiter (REQ-001) is in memory, so more workers or instances would each allow 10 tries, and a restart resets the count; scaling out first needs a shared limiter, see Alternatives: Redis), `scripts/smoke.sh` (HTTPS reachable, HSTS present, `/api/v1/members` → 401), `docs/metrics/scoreboard.md` row.

**Order of work:** Dockerfile → host with a persistent volume for the SQLite file → TLS → `alembic upgrade head` on start → `make setup-family` → smoke test from outside the home network → manual iPad Safari check (§7 Browsers).

**Tests that prove it works:** the smoke script (NFR Hosting); a check that the Dockerfile command has `--workers 1`; manual tablet check list.

**Risks:** SQLite needs a host with a persistent disk and one instance. If the host only offers ephemeral disks, switch to Postgres. SQLModel and Alembic keep that a config change plus re-running migrations, and the `ON CONFLICT` and `BEGIN IMMEDIATE` helpers sit behind `app/db.py` for that reason.

---

## Parallelizable work

| Can run in parallel | Why the files are disjoint |
|---|---|
| **Phase 1 ∥ Phase 2** | Phase 2 touches only `backend/app/domain/**` and `backend/tests/unit/**` (pure functions, no imports from models/db). Phase 1 touches `db.py`, `models/`, `security/`, `routers/sessions.py`, `routers/families.py`, `migrations/`. Shared: `clock.py`/`dates.py` (land `clock.py` in Phase 1's first commit). |
| **Phase 3 ∥ Phase 4** | Phase 4 is `frontend/**` only. It codes against the spec §4 contract and regenerates `schema.d.ts` when Phase 3 routes land. Phase 4 needs only Phase 1's session endpoints to be real. |
| **Phases 5, 6, 7, 8 in parallel** (after Phase 4) | Each owns its own `frontend/src/screens/<Screen>` and `components/<ScreenSpecific>` files. Phase 4 pre-registers every route in `App.tsx` with placeholders, so nobody edits the router. Shared hot spot: `copy.ts`. Mitigation: one section per screen, append-only (or split into `copy/<screen>.ts`). |
| **Phase 9 ∥ Phases 5, 7, 8** | Its own `screens/parent/**` files. **Not** parallel with Phase 6, because the REQ-014 correction UI edits `DayChip`/`WeekView`. |
| **Phase 10 per-screen specs** | `e2e/<screen>.spec.ts` can be written as each screen phase merges. Only `playwright.config.ts`, `fixtures.ts` and the test-support router need to exist first. |
| **Phase 11 Dockerfile/runbook** | `Dockerfile`, `deploy/`, `docs/` don't overlap with app code and can start any time after Phase 0. |

Critical path: 0 → 1 → 3 → 4 → 5 → 10 → 11. Phase 2 must land before Phase 3's check-ins/savers work.

## Alternatives considered and rejected

- **Storing earned gems as ledger rows** (write a +1 transaction per check-in). Rejected: undo, yesterday, parent corrections and habit deletes all change past streaks and bonuses (REQ-018 "earned gems always equal the rules applied to current check-ins"). A stored ledger would need fragile reversal logic. Deriving earnings and storing only spends matches spec §3.
- **Caching streaks/gems in columns.** Rejected for v1: recomputation is cheap at family scale, and a cache adds invalidation bugs on every correction path. Can be revisited for multi-family.
- **JWT / stateless tokens.** Rejected: REQ-002 needs server-side revocation (a replayed cookie → 401), and REQ-004 needs server-enforced idle expiry.
- **Separate frontend host (CDN) + API on another origin.** Rejected: it needs CORS, a cross-site cookie (SameSite=None), and makes `default-src 'self'` and CSRF harder. One origin is simpler and safer.
- **`SQLModel.metadata.create_all` instead of Alembic.** Rejected: history must survive ≥ 13 months of schema evolution.
- **Postgres from day one.** Rejected for local dev and tests per the tooling choice. The code stays portable (Phase 11 risk).
- **TanStack Query / Redux / Zustand.** Rejected to keep dependencies to the stated tooling. The app needs only fetch + refetch + polling, about 60 lines of hooks. Revisit if caching logic grows.
- **MSW for frontend API mocks.** Rejected in favour of a small `mockApi.ts` around `fetch` (`vi.fn`), so the test toolchain stays at Vitest + RTL + jsdom.
- **Tailwind or a component library (MUI/Chakra).** Rejected: the custom design (big kid-friendly targets, warm palette) is easier in plain CSS with tokens, and it avoids heavy bundles and any external font or CDN loading [child-data-privacy #5].
- **SSE/WebSockets for live board updates.** Rejected: REQ-012 allows 30 s polling and on-focus refetch, which is simpler and must not extend the session anyway.
- **A public sign-up or setup endpoint.** Rejected by the spec (C7): family creation is a CLI, so passcode entry stays the only unauthenticated route.
- **Redis-backed rate limiter.** Rejected for v1 (one instance). The in-memory window plus DB-persisted PIN lockout is enough. It becomes necessary for multi-instance.
- **Copying mockup sample data into E2E fixtures.** Rejected (C16): the mockups break REQ-020, so fixtures follow the spec.

## Decisions to confirm during review (non-blocking)

1. Cloud host for Phase 11. It needs a persistent volume for SQLite, otherwise use Postgres.
2. Phase 3 split into 3a/3b PRs (recommended because of size).
3. `GemTransactionRead.kind` widened with derived earning kinds (Phase 8 note). This is a small spec §4 clarification. *Done in Phase 3.*

## Verification (whole MVP)

- `make lint test`: ruff, ESLint, Prettier, `tsc`, pytest (unit + API), Vitest. All green on every phase PR.
- `make api-types && git diff --exit-code`: frontend types match OpenAPI.
- `uv run python scripts/req_coverage.py`: every REQ has the unit/API/E2E cells required by spec §7.
- `make e2e`: Playwright Chromium, Firefox and WebKit at 360/768/1440, with axe and horizontal-scroll checks.
- `make dev` + `make seed-dev`: manual walkthrough of all 9 screens against the mockups in `docs/design/mvp/`.
- After deploy: `scripts/smoke.sh https://<host>` from outside the home network, plus the manual iPad Safari check.
