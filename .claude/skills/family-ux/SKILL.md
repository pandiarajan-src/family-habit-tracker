---
name: family-ux
description: Load before building or changing any frontend screen, page, React component (.tsx), CSS module, button, layout or user-facing copy — and before writing Playwright tests that select UI elements or UI sections of specs and plans. UX and accessibility rules for the family app (phone-first layout, tap targets, check-off taps, labelled icons).
---

# Family UX

Parents and young children share this app, often on a phone.

## Rules

1. **Responsive, any-input layout.** Every screen works at viewport widths from 360px to 1440px with no horizontal page scroll and no clipped or overlapping content; at 360px it is a single column. Size page-level containers with fluid units (`%`, `fr`, `minmax()`, media/container queries), never fixed pixel widths. Nothing is hover-only: every action works by touch, mouse and keyboard (Tab to reach, Enter/Space to activate, visible focus ring).
2. **Tap targets.** Every interactive element is at least 44×44px.
3. **Fast check-off.** Checking off a habit takes at most 2 taps from the home screen.
4. **Labelled icons.** Every icon is paired with a visible text label; no icon-only controls.
5. **Contrast.** Text and controls meet WCAG 2.2 AA contrast (4.5:1 text, 3:1 large text and UI parts).
6. **Kind copy.** Kid-friendly, encouraging wording; never shame. Say "Let's try tomorrow!", not "Failed" or "Missed".
7. **Accessible names.** Every interactive element has an accessible name, because Playwright selects by role and name (`getByRole('button', { name: 'Check off Brush teeth' })`).

## How to verify

Run the Playwright e2e tests at 360px, 768px and 1440px viewports using only role/name selectors, asserting `document.documentElement.scrollWidth <= window.innerWidth` on each screen; complete a habit check-off using only the keyboard; spot-check tap-target sizes and contrast in dev tools (or axe); count taps to check off a habit; read new copy for negative words like "failed", "missed" or "bad".
