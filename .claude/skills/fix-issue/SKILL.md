---
name: fix-issue
description: Fix a GitHub issue test-first — reproduce the bug with a failing test, commit it, lock tests, fix the code until it passes, then verify and open a PR that closes the issue. Run manually with the issue number.
disable-model-invocation: true
argument-hint: <issue-number>
allowed-tools: Bash(gh issue view *) Bash(make *) Bash(git *) Bash(touch .claude/.fix-mode) Bash(rm .claude/.fix-mode)
---

# Fix an issue

Issue: `#$ARGUMENTS`

The test is written and committed before any fix, then locked. That order is the point: a test written after the fix tends to prove whatever the fix does, while a test committed first proves the bug existed and is gone. Bug fixes don't go through intent → spec → plan, but the Definition of done in `CLAUDE.md` still applies.

## 1. Understand the bug

Run `gh issue view $ARGUMENTS` and restate the bug in **one sentence**: what happens, and what should happen instead. If the issue is too vague to write that sentence, or reads like a feature request rather than a bug, stop and ask the user.

## 2. Branch

Start from an up-to-date `main` and create `fix/$ARGUMENTS-<slug>`, where `<slug>` is 2–4 kebab-case words from your sentence (e.g. `fix/42-streak-resets-at-midnight`).

## 3. Reproduce with a failing test

Write the smallest test that shows the bug, at the lowest layer that can show it (service unit test before API test before UI test). Follow the project's test rules:
- Tag it with the REQ it falls under: `@pytest.mark.req("REQ-011")` or `describe("REQ-011 …")`.
- Use the standard fixtures (Dad 🦉 / Mum 🌻 / Mia 🐬 / Kavi 🦖, today = Tue 20 Oct 2026, `Europe/London`) and the clock or `time-machine`, never real time.
- Frontend: query by role/label, drive with `user-event`.

Run only that test:
- `cd backend && APP_ENV=test uv run pytest tests/<file>.py::<test_name>`
- `cd frontend && npx vitest run <file> -t "<name>"`

Show the output and confirm it fails **for the reason in your sentence** — a wrong assertion value or the wrong status code, not an import error, typo or missing fixture. A test that fails for the wrong reason proves nothing; fix the test and run it again.

## 4. Commit the test only

Stage only the test file(s) and commit `test: reproduce #$ARGUMENTS`. Check `git status` first so no code changes sneak in.

## 5. Lock tests

Run `touch .claude/.fix-mode`. From here a hook blocks edits to test files.

## 6. Fix the code

Change production code until the test passes. Rerun the single test after each change, then `make be-test` / `make fe-test` for the side you touched, so the fix doesn't break neighbouring tests.

**Never edit tests in this step**, including other tests that start failing — a newly failing test means the fix is wrong or changes intended behaviour. If the reproduction test itself now seems wrong (it asserts the wrong expected behaviour, or the bug is elsewhere), stop: explain what you found and why, leave `.claude/.fix-mode` in place, and let the user decide.

## 7. Verify and open the PR

1. `rm .claude/.fix-mode`.
2. Run `make verify` once. If it fails only on a coverage gate for lines your fix added, add tests for them now (tests are unlocked); for any other failure, fix the code. Paste the last ~10 lines of the passing run.
3. If the fix changed a backend route or schema, run `make api-types` and include `schema.d.ts`.
4. Commit `fix: <summary> (closes #$ARGUMENTS)`.
5. Push the branch and open a PR. In the body: the one-sentence bug, the root cause, the fix, and the test that proves it (with its commit). Mention any `# nosec` you added.

Finish by giving the user the PR link.
