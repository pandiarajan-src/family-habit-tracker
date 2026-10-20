#!/usr/bin/env bash
# PreToolUse (Bash, if "Bash(git commit*)"): block commits whose added lines
# contain API-key or private-key patterns. Exit 2 + stderr blocks.
set -euo pipefail

command=$(jq -r '.tool_input.command // empty')
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root"

# `git commit -a` / `-am` / `--all` also commits unstaged tracked changes.
if [[ "$command" =~ git[[:space:]]+commit.*([[:space:]]-[a-zA-Z]*a|--all) ]]; then
  diff=$(git diff HEAD -U0 --no-color)
else
  diff=$(git diff --cached -U0 --no-color)
fi
[ -z "$diff" ] && exit 0

q="[\"']"
patterns=(
  'AKIA[0-9A-Z]{16}'                   # AWS access key
  'gh[pousr]_[A-Za-z0-9]{36,}'         # GitHub token
  'github_pat_[A-Za-z0-9_]{60,}'       # GitHub fine-grained token
  'sk-ant-[A-Za-z0-9_-]{20,}'          # Anthropic
  'sk-(proj-)?[A-Za-z0-9_-]{32,}'      # OpenAI
  'AIza[0-9A-Za-z_-]{35}'              # Google API key
  'xox[abprs]-[A-Za-z0-9-]{10,}'       # Slack
  '(sk|rk)_live_[A-Za-z0-9]{20,}'      # Stripe live key
  '-----BEGIN [A-Z ]*PRIVATE KEY-----' # private key
  # generic: api_key / secret / token = "<24+ chars>"
  "([Aa][Pp][Ii][_-]?[Kk][Ee][Yy]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn])$q?[[:space:]]*[:=][[:space:]]*$q[A-Za-z0-9_/+=-]{24,}$q"
)
regex=$(IFS='|'; echo "${patterns[*]}")

# Report file:line with the match redacted to its first 4 characters.
hits=$(printf '%s\n' "$diff" | awk -v re="$regex" '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^@@/ { split($3, a, /[+,]/); line = a[2]; next }
  /^\+/ {
    if (match(substr($0, 2), re)) {
      printf "  %s:%d  %s…\n", file, line, substr($0, RSTART + 1, 4)
    }
    line++
  }
')

if [ -n "$hits" ]; then
  printf '%s\n' \
    "⛔ Commit blocked: possible secret in the changes being committed:" \
    "$hits" \
    "Why: a key in git history stays leaked even after a later commit removes it." \
    "Instead: remove it from the file, put the real value in .env (gitignored) and read it via" \
    "app/config.py Settings; add a placeholder to .env.example; unstage with \`git restore --staged <file>\`." \
    "If it is a known false positive (e.g. a test fixture), ask the user to commit it themselves." >&2
  exit 2
fi
exit 0
