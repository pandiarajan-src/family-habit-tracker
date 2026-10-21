# family-habit-tracker

Family Habit Tracker is a web app for households to build habits together. Family members set up shared and personal habits, check them off each day, and see streaks and progress across the whole family. The repo is a monorepo with a Python backend, a web frontend, end-to-end tests and evals, and it is built with an AI-native SDLC using Claude and GitHub.

## How this repo is built (AIDLC)

Every change follows the same pipeline: **intent → spec → plan → code**. A human writes the intent; the spec, plan and code follow from it, each reviewed before the next begins. Each change lives in its own folder under `changes/NNNN-slug/`, and shipped changes are tracked on the [scoreboard](docs/metrics/scoreboard.md).

See [`changes/README.md`](changes/README.md) for the full process and how to start a change.

## Run locally

You need [uv](https://docs.astral.sh/uv/) (it installs Python 3.14.7 from `.python-version`), Node 26 (`frontend/.nvmrc`) and `make`.

```sh
make setup     # install backend + frontend deps from the lock files; creates .env from .env.example
make seed-dev  # create the database and a sample family (Dad, Mum, Mia, Kavi)
make dev       # API on http://localhost:8000 (docs at /docs), app on http://localhost:5173
make verify    # lint + type-check + all tests; prints ✅ VERIFY PASSED
```

`make dev` applies database migrations first (`make migrate` runs them on their own).
The sample family's passcode and PINs are in `backend/app/cli.py` (dev only; `seed-dev` refuses `APP_ENV=prod`).
For a real family, run `make setup-family` instead: it asks for the passcode and the first parent's PIN without showing them (set `FAMILY_TZ`, default `Europe/London`).
To set up the whole family in one go, run `scripts/family-setup.sh`: it creates the family and first parent, then adds members until you type `exit`. If a family already exists, it offers to update it (a member's nickname, avatar emoji, role or PIN, add a member, or change the family passcode) or to delete it and start again.

Other targets: `make help`. Settings are environment variables; see [`.env.example`](.env.example).
After changing a backend route or schema, run `make api-types` and commit `frontend/src/api/schema.d.ts` (CI checks it's up to date).
