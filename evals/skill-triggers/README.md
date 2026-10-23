# Skill trigger evals

Checks that each **model-invoked** project skill (`.claude/skills/*` without `disable-model-invocation`)
loads when it should and stays quiet on near-misses. Slash-only skills (`fix-issue`, `intent-to-spec`) are excluded.

| File | Committed | What it is |
|---|---|---|
| `cases.json` | yes | 3 should-trigger and 3 near-miss prompts per skill. Target ≥ 90% correct. |
| `run.py` | yes | Runs every case in a fresh `claude -p` session and records which skills the `Skill` tool loaded. |
| `history.jsonl` | yes | One line per run: model, accuracy, per-case pass/fail and skills loaded, and a hash of each skill's `description`. |
| `results/<stamp>_<label>/` | no (gitignored) | Local `report.md`, `results.json` and raw `transcripts/*.jsonl`, for debugging a miss. |

```sh
python3 evals/skill-triggers/run.py --label my-run              # all cases, 4 in parallel
python3 evals/skill-triggers/run.py --only ux- --label ux       # one skill
python3 evals/skill-triggers/run.py --only api-pos-1 --no-history  # smoke test, not logged
```

Commit the new `history.jsonl` line in the same PR as the description or `cases.json` change it measures.
The `descriptions` hashes show which skill wording each score belongs to. If a reviewer needs evidence for
a miss, attach the transcript from `results/` to the PR instead of committing it.

## How it runs

- Each case runs in a throwaway clone of HEAD with no git remote. The **working-tree** `.claude/skills` is
  copied in, so description edits can be tested before committing. The clone is untrusted, so in `-p` mode
  any Bash that needs approval (gh, git push) is denied. Nothing touches this repo or GitHub.
- Claude keeps its normal tools. Restricting them skews results: with Edit/Write disabled, Claude noticed
  it couldn't code and skipped the skills.
- A session stops at its first Edit/Write, because skills load before code. Budget cap $1 per case, 240 s timeout.
- Scoring: a positive passes if the target skill loaded; a near-miss passes if it did not. Other skills loading
  doesn't count either way.
- Each case runs once per run, so a single run doesn't show how much results vary between sessions.
  Re-run after every description edit.

Write positives for features that **don't exist yet**. When a feature already exists, Claude checks the repo,
answers, and correctly skips the skill, so the case fails without the description being wrong.

## Lessons so far

- 2026-10-23: `family-ux` and `api-conventions` missed real UI/route work (22/24) while their descriptions
  opened with a noun phrase ("UX and accessibility rules…"). Opening with the trigger verbs
  ("Load before building or changing any frontend screen…") brought the score to 24/24. See `history.jsonl`.
