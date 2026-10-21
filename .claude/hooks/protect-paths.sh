#!/usr/bin/env bash
# PreToolUse (Edit|Write): guard local secrets, lock files, CI workflows, and tests while .claude/.fix-mode exists.
# Exit 2 + stderr blocks; a JSON permissionDecision "ask" hands the call to the human.

set -euo pipefail

path=$(jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
rel="${path#"$root"/}"
name=$(basename "$rel")

block() {
  printf '⛔ Blocked edit to %s\nWhy: %s\nInstead: %s\n' "$rel" "$1" "$2" >&2
  exit 2
}

case "$name" in
  .env.example) exit 0 ;;
  .env*)
    block "env files hold local secrets (passcodes, keys) and are gitignored; Claude must not write them." \
      "add the variable with a placeholder to .env.example and tell the user which value to set in their own .env." ;;
  uv.lock)
    block "uv.lock is generated; hand edits break hashes and \`uv sync --locked\` in CI." \
      "ask the user before adding a dependency, then run \`uv add <pkg>\` or \`uv lock\` in backend/." ;;
  package-lock.json)
    block "package-lock.json is generated; hand edits break integrity hashes and \`npm ci\` in CI." \
      "ask the user before adding a dependency, then run \`npm install <pkg>\` in frontend/." ;;
esac

case "$rel" in
  .github/workflows/*)
    jq -n --arg r "$rel is a CI workflow: changes alter what gates every PR. Confirm this edit." \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
    ;;
esac

if [ -f "$root/.claude/.fix-mode" ]; then
  case "$rel" in
    backend/tests/*|e2e/*|frontend/src/test/*|*.test.ts|*.test.tsx)
      block "fix mode is on: the reproduction test is committed and locked." \
        "fix production code; if the test is wrong, stop and explain to the user." ;;
  esac
fi

exit 0
