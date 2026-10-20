# Changes

Every change to this repo starts here. Nothing gets coded until it has an accepted intent, a spec and a plan.

## Pipeline

```
intent → spec → plan → code
```

1. **Intent** (`intent.md`): the problem, the outcome we want, and how we'll know it worked. Written by a human. Status moves `draft` → `accepted` or `rejected`.
2. **Spec** (`spec.md`): what the system must do. Testable requirements and acceptance criteria, derived from an accepted intent.
3. **Plan** (`plan.md`): how we'll build it. Files to touch, tasks in order, tests to write, risks.
4. **Code**: the implementation, opened as a PR that references the change folder.

Each stage is reviewed before the next one starts.

## Layout

Each change gets its own folder, numbered in sequence with a short kebab-case slug:

```
changes/
├── _templates/
│   └── intent.md
├── 0001-add-habit/
│   ├── intent.md
│   ├── spec.md
│   └── plan.md
└── 0002-weekly-streaks/
    ├── intent.md
    ├── spec.md
    └── plan.md
```

- `NNNN` is a zero-padded, four-digit number. Take the next unused one.
- `slug` is a few lowercase words joined by hyphens.

## Starting a change

```sh
mkdir changes/NNNN-slug
cp changes/_templates/intent.md changes/NNNN-slug/intent.md
```

Fill in the intent, commit it, and get it accepted before writing the spec.

## Metrics

Each change that ships gets a row in [`docs/metrics/scoreboard.md`](../docs/metrics/scoreboard.md).
