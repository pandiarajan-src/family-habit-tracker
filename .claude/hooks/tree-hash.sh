#!/usr/bin/env bash
# Print the git tree id of the working tree as it is now, in the current repo:
# staged, unstaged and untracked (non-ignored) files all count. Committing
# everything gives a HEAD whose tree has the same id, so a `make verify` pass
# recorded before the commit still matches at `gh pr create`.
# Used by `make verify` (records a pass) and pre-pr-gate.py (looks it up).
set -euo pipefail

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Start from a copy of the real index so unchanged files aren't re-hashed;
# the real index and HEAD are never touched.
index=$(git rev-parse --git-path index)
[ -f "$index" ] && cp "$index" "$tmp/index"
GIT_INDEX_FILE="$tmp/index" git add -A
GIT_INDEX_FILE="$tmp/index" git write-tree
