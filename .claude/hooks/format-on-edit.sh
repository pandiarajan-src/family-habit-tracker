#!/usr/bin/env bash
# PostToolUse (Edit|Write): auto-fix and format the one edited file.
# Never blocks: always exits 0. Issues the fixers can't solve go back to
# Claude as additionalContext so it can fix them in its next edit.
set -uo pipefail

path=$(jq -r '.tool_input.file_path // empty')
[ -z "$path" ] || [ ! -f "$path" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
rel="${path#"$root"/}"
issues=""

case "$rel" in
  backend/*.py)
    ruff="$root/backend/.venv/bin/ruff"
    if [ -x "$ruff" ]; then
      cd "$root/backend"
      issues=$("$ruff" check --fix --quiet "$path" 2>&1)
      "$ruff" format --quiet "$path" >/dev/null 2>&1
    fi
    ;;
  frontend/*)
    bin="$root/frontend/node_modules/.bin"
    cd "$root/frontend"
    case "$rel" in
      *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs)
        [ -x "$bin/eslint" ] && issues=$("$bin/eslint" --fix --max-warnings=0 --no-warn-ignored "$path" 2>&1)
        ;;
    esac
    [ -x "$bin/prettier" ] && "$bin/prettier" --write --ignore-unknown --log-level=silent "$path" >/dev/null 2>&1
    ;;
esac

if [ -n "$issues" ]; then
  jq -n --arg c "Lint issues the auto-fixer could not fix in $rel:"$'\n'"$issues" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $c}}'
fi
exit 0
