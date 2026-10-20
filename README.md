# family-habit-tracker

Family Habit Tracker is a web app for households to build habits together. Family members set up shared and personal habits, check them off each day, and see streaks and progress across the whole family. The repo is a monorepo with a Python backend, a web frontend, end-to-end tests and evals, and it is built with an AI-native SDLC using Claude and GitHub.

## How this repo is built (AIDLC)

Every change follows the same pipeline: **intent → spec → plan → code**. A human writes the intent; the spec, plan and code follow from it, each reviewed before the next begins. Each change lives in its own folder under `changes/NNNN-slug/`, and shipped changes are tracked on the [scoreboard](docs/metrics/scoreboard.md).

See [`changes/README.md`](changes/README.md) for the full process and how to start a change.
