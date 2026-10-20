---
name: intent-to-spec
description: Turn an accepted `changes/NNNN-slug/intent.md` into an engineering-ready `spec.md` in the same folder — numbered requirements with Given/When/Then criteria, data model, API contract, UI screens, NFRs, test strategy and concerns — applying and citing every relevant project skill. Run manually with the change folder path.
disable-model-invocation: true
argument-hint: <path to change folder>
---

# Intent → spec

The spec is the second gate in `changes/README.md` (intent → spec → plan → code). It says *what the system must do*, precisely enough that an engineer can write `plan.md` from it and a reviewer can check every requirement against a test. It does not say how to build it — no code.

Change folder: `$ARGUMENTS`

## 1. Gather inputs

- Read `$ARGUMENTS/intent.md`. If the folder or file is missing, stop and say so. If its status isn't `accepted`, carry on but flag it at the top of your final message — the pipeline expects an accepted intent.
- If `$ARGUMENTS/spec.md` already exists, show what's there and ask before overwriting it.
- Read `SKILL.md` of every project skill in `.claude/skills/` and decide which apply. At minimum `child-data-privacy`, `api-conventions` and `family-ux` almost always do; include any other project skill whose rules touch this change. Read them from disk rather than from memory, because the rule numbers you cite must match the current files.

## 2. Write `$ARGUMENTS/spec.md`

Wherever a project-skill rule shapes a decision, cite it inline in brackets using the skill name and the rule's number from its `## Rules` list, e.g. `[child-data-privacy #1]`, `[api-conventions #3]`, `[family-ux #2]`. Cite at the point of use (the field, endpoint, screen or criterion), not in a summary list at the end — reviewers check compliance line by line. Every applicable rule should be cited at least once; if a rule genuinely doesn't apply, it needs no mention.

Stay faithful to the intent. Where the intent is silent, make the smallest reasonable assumption, label it **Assumption:**, and list it under Concerns so a human can confirm it. Don't invent features the intent didn't ask for — put tempting extras under Out of scope.

Use exactly these sections:

```markdown
# Spec: <change title>

Change: `<folder name>` · Intent: [intent.md](intent.md) · Status: draft

## 1. Summary
What we're building and why, in a short paragraph traced to the intent's problem and outcome.

## 2. Requirements
### REQ-001: <short name>
**User story:** As a <role>, I want <capability>, so that <benefit>.
**Acceptance criteria:**
- Given <context>, when <action>, then <observable result>.
- (include failure/edge cases, not just the happy path)

(REQ-002, REQ-003, … — one testable behaviour each, numbered sequentially)

## 3. Data model
Entities, fields (name, type, constraints), relationships and cascade rules. No ORM or SQL code.

## 4. API contract
| Method | Path | Request | Response | Status codes |
|---|---|---|---|---|
(one row per endpoint; name request/response schemas; note which REQs each serves and auth requirements)

## 5. UI screens
For each screen: what it shows, the actions available, and the REQs it satisfies.

## 6. Non-functional requirements
Privacy, security, accessibility, performance, device support, logging — each stated measurably where possible.

## 7. Test strategy
| REQ | Unit | API | E2E |
|---|---|---|---|
(every REQ appears; describe each test briefly, or "—" with a reason if a level doesn't apply)

## 8. Answers to the intent's open questions
Each open question from the intent, with an answer and reasoning — or "carried forward" plus who needs to decide.

## 9. ⚠️ Concerns
Risks, ambiguities, assumptions you made, and any place where project policies (or the intent and a policy) conflict and can't both be met. For a conflict, name both rules, explain why they collide here, and give options — don't silently pick a winner.

## 10. Out of scope
What this spec deliberately excludes.
```

Before saving, check: every REQ has at least one Given/When/Then; every REQ appears in the test strategy; every endpoint and screen links back to a REQ; every intent open question is answered or carried forward.

## 3. Finish

Don't write code, and don't move on to `plan.md`. End your reply with:

1. The path of the spec you wrote and a one-line count (e.g. "12 requirements, 9 endpoints, 5 screens").
2. **Concerns needing a human decision** — a numbered list of the concerns from section 9 that someone must decide before planning, each in one or two lines with the options. Leave out concerns you already resolved yourself.
