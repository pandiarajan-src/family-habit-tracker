---
name: write-intent
description: Turn a raw problem, idea, feature request, bug report or incident into a reviewed `changes/NNNN-slug/intent.md` by interviewing the originator like a business analyst, then opening a `stage:intent` PR. Use this whenever the user describes something that should become an intent, says "capture this idea", "write an intent", "log this problem", pastes a GitHub issue or incident to start a change, or wants to kick off the intent → spec → plan → code pipeline — even if they never say "intent.md".
---

# Write an intent

An intent records *what problem exists and what outcome we want*, in the originator's own words. It is the first gate in `changes/README.md` (intent → spec → plan → code); the spec and plan come later, so an intent that smuggles in solutions skips the review those stages exist for.

## 1. Interview

Act as a business analyst. Ask **one or two questions at a time** and wait for answers; a wall of questions gets skimmed. Cover, as needed:

- **Problem & evidence**: what's wrong or missing today, and who feels it?
- **Users & systems**: which users or family roles, which parts of the app?
- **Outcome**: what will be true once this ships?
- **Constraints**: deadlines, privacy, accessibility, dependencies.
- **Success measures**: how will we observe that it worked?
- **Out of scope**: what this deliberately won't cover.

Skip anything the originator already answered. Stop when the idea is concrete, and **never exceed 10 questions in total**. Whatever is still unknown becomes an Open question rather than another round. Also ask whether there's a related GitHub issue, if one hasn't been mentioned.

## 2. Pick the folder

- Number: the highest `NNNN` under `changes/` (ignore `_templates`) plus one, zero-padded to four digits. Also check `git ls-remote --heads origin 'intent/*'` so you don't reuse a number someone else has claimed on an open branch.
- Slug: a few lowercase words joined by hyphens, e.g. `weekly-streaks`.

## 3. Write `changes/NNNN-slug/intent.md`

Read `changes/_templates/intent.md` and use **exactly its sections, in order**: don't add, rename or drop any.

- Header: fill Author (the originator), Function, `**Status:** draft`, and today's date.
- Use the originator's words and phrasing. Tidy grammar, but don't reframe.
- Don't invent solutions, designs or tech choices. If the originator proposed one, record it as context in Problem or Constraints, not as the outcome.
- Leave nothing as a template placeholder. If a section has no answer, say so briefly, and put each unknown under **Open questions**.

## 4. Review

Show the full file and ask the originator to correct anything that's wrong or missing. Apply their edits and show it again. Repeat until they explicitly approve. Don't touch git before approval: an unapproved intent shouldn't land on a branch or in a PR.

## 5. Publish (only after approval)

```sh
git switch -c intent/NNNN-slug
git add changes/NNNN-slug/intent.md
git commit -m "intent(NNNN): <title>"
git push -u origin intent/NNNN-slug
gh pr create --title "intent(NNNN): <title>" --label stage:intent --body-file <body>
```

- `<title>` is the intent's short name from its `# Intent:` heading.
- Base the PR body on `.github/pull_request_template.md`. Under "Linked intent / spec / plan", give `changes/NNNN-slug/intent.md` and the related issue as `Refs #N`. Use `Refs`, not `Closes`, because accepting an intent doesn't resolve the issue. Mark the code-only sections as N/A.
- Finish by giving the originator the PR URL.
