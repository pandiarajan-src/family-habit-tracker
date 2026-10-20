# Family Habit Tracker — developer commands. Run `make help` for the list.
# Every target exits non-zero on failure.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

# Load local settings (see .env.example) and pass them to every recipe.
ifneq (,$(wildcard .env))
include .env
export
endif

BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173
OPENAPI_TS_VERSION := 7.13.0

BE := cd backend &&
FE := cd frontend &&

.PHONY: help setup check-tools dev be-dev fe-dev build \
        lint be-lint fe-lint fmt \
        test test-backend test-frontend be-test fe-test coverage \
        security be-security fe-security api-types e2e migrate seed-dev setup-family verify clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

## ---- Setup -------------------------------------------------------------

check-tools: ## Check uv, Node and npm are installed
	@command -v uv >/dev/null || { echo "❌ uv not found: https://docs.astral.sh/uv/"; exit 1; }
	@command -v node >/dev/null || { echo "❌ node not found (need $$(cat frontend/.nvmrc))"; exit 1; }
	@command -v npm >/dev/null || { echo "❌ npm not found"; exit 1; }
	@echo "uv $$(uv --version | cut -d' ' -f2) · node $$(node --version) · npm $$(npm --version)"

setup: check-tools ## Install backend and frontend dependencies from the lock files
	@test -f .env || { cp .env.example .env && echo "Created .env from .env.example"; }
	$(BE) uv sync --locked
	$(FE) npm ci --no-audit --no-fund
	@echo "✅ SETUP DONE"

## ---- Run ---------------------------------------------------------------

dev: ## Run backend (:8000) and frontend (:5173) together; Ctrl-C stops both
	@$(MAKE) -j2 be-dev fe-dev

be-dev: migrate ## Run the backend with auto-reload (applies migrations first)
	$(BE) uv run fastapi dev app/main.py --port $(BACKEND_PORT)

fe-dev: ## Run the Vite dev server (proxies /api to the backend)
	$(FE) npm run dev -- --port $(FRONTEND_PORT)

build: ## Build the frontend into frontend/dist
	$(FE) npm run build

## ---- Quality -----------------------------------------------------------

lint: be-lint fe-lint ## Lint and type-check everything (no changes made)

be-lint:
	$(BE) uv run ruff check .
	$(BE) uv run ruff format --check .
	@# Time comes only from app/clock.py (ruff DTZ misses date.today() and aware now(tz)).
	@$(BE) if grep -rnE '(datetime|date)\.(now|utcnow|today)\(' app migrations --include='*.py' \
		| grep -v '^app/clock.py:'; then echo "❌ use app/clock.py for the current time"; exit 1; fi

fe-lint:
	$(FE) npm run lint
	$(FE) npm run format:check
	$(FE) npm run typecheck

fmt: ## Auto-fix lint issues and format all code
	$(BE) uv run ruff check --fix .
	$(BE) uv run ruff format .
	$(FE) npm run lint -- --fix
	$(FE) npm run format

## ---- Tests -------------------------------------------------------------

test: test-backend test-frontend ## Run all unit and API tests

test-backend: ## Run backend tests with coverage (fails under 95%)
	$(BE) APP_ENV=test uv run pytest -q --cov=app --cov-report=term-missing --cov-fail-under=95

test-frontend: ## Run frontend tests with coverage (thresholds in vite.config.ts)
	$(FE) npx vitest run --coverage

be-test: test-backend
fe-test: test-frontend

coverage: ## Run all tests with coverage reports
	$(BE) APP_ENV=test uv run pytest --cov --cov-report=term-missing
	$(FE) npm run test:coverage

security: be-security fe-security ## Scan dependencies and app code for known vulnerabilities

be-security:
	$(BE) uv audit
	$(BE) uv run bandit -r app -q

fe-security:
	$(FE) npm audit --audit-level=high --omit=dev

e2e: ## Playwright end-to-end tests (added in Phase 10)
	@echo "e2e: no Playwright tests yet (Phase 10)."

## ---- API contract / data ----------------------------------------------

api-types: ## Regenerate frontend/src/api/schema.d.ts from the backend OpenAPI
	@mkdir -p frontend/src/api
	$(BE) uv run python -c "import json; from app.main import create_app; print(json.dumps(create_app().openapi(), indent=2))" > ../frontend/openapi.json
	$(FE) npx --yes openapi-typescript@$(OPENAPI_TS_VERSION) openapi.json -o src/api/schema.d.ts
	@rm -f frontend/openapi.json

migrate: ## Apply database migrations (Alembic) to DATABASE_URL
	$(BE) uv run python -m app.cli migrate

seed-dev: ## Seed the dev database with the sample family (refuses APP_ENV=prod)
	$(BE) uv run python -m app.cli seed-dev

setup-family: ## Create the family: prompts for passcode and first parent's PIN (FAMILY_TZ=Europe/London)
	$(BE) uv run python -m app.cli setup-family --timezone $${FAMILY_TZ:-Europe/London}

## ---- All checks --------------------------------------------------------

verify: lint test security ## Lint + all tests + security scan; must pass before a PR (e2e joins in Phase 10)
	@echo ""
	@echo "✅ VERIFY PASSED"

clean: ## Remove build outputs and caches (keeps dependencies)
	rm -rf frontend/dist frontend/coverage backend/.pytest_cache backend/.ruff_cache backend/.coverage backend/htmlcov
