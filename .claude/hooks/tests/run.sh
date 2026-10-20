#!/usr/bin/env bash
# Feed fake tool-call JSON into each hook in .claude/hooks/ and assert the
# exit code and output. Run with `make test-hooks` (part of `make verify`).
#
# Hooks under test run against throwaway dirs (temp git repos, a stub `make`)
# so nothing touches the real repo, except format-on-edit, which needs the real
# ruff/eslint/prettier: it writes temp files into backend/ and frontend/src/ and
# always removes them.
set -uo pipefail

HOOKS="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${HOOK_TEST_REPO:-$(git -C "$HOOKS" rev-parse --show-toplevel)}"
TMP="$(mktemp -d)"
TEMP_FILES=()
cleanup() {
  rm -f "${TEMP_FILES[@]+"${TEMP_FILES[@]}"}"
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

pass=0
fail=0
OUT=""
ERR=""
CODE=0

# run <hook> <json> [project-dir]: sets OUT, ERR, CODE.
run() {
  local hook="$1" json="$2" project="${3:-$REPO}"
  OUT=$(printf '%s' "$json" | CLAUDE_PROJECT_DIR="$project" "$HOOKS/$hook" 2>"$TMP/stderr")
  CODE=$?
  ERR=$(cat "$TMP/stderr")
}

# check <name> <expected-exit> [stdout-substring] [stderr-substring]
check() {
  local name="$1" want="$2" out_has="${3:-}" err_has="${4:-}" why=""
  [ "$CODE" -eq "$want" ] || why="exit $CODE, want $want"
  [ -z "$out_has" ] || [[ "$OUT" == *"$out_has"* ]] || why+="${why:+; }stdout lacks '$out_has'"
  [ -z "$err_has" ] || [[ "$ERR" == *"$err_has"* ]] || why+="${why:+; }stderr lacks '$err_has'"
  if [ -z "$why" ]; then
    pass=$((pass + 1))
    printf '  ✓ %s\n' "$name"
  else
    fail=$((fail + 1))
    printf '  ✗ %s: %s\n' "$name" "$why"
    printf '      stdout: %s\n      stderr: %s\n' "${OUT:0:300}" "${ERR:0:300}"
  fi
}

edit() { jq -n --arg f "$1" '{tool_name: "Edit", tool_input: {file_path: $f}}'; }
bash_cmd() { jq -n --arg c "$1" '{tool_name: "Bash", tool_input: {command: $c}}'; }
repeat() { printf "%${2}s" | tr ' ' "$1"; }

# A throwaway git repo with one commit, used as CLAUDE_PROJECT_DIR.
new_repo() {
  local dir
  dir=$(mktemp -d "$TMP/repo.XXXX")
  git -C "$dir" init -q
  git -C "$dir" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  echo "$dir"
}

# ---------------------------------------------------------------- protect-paths
echo "protect-paths.sh"
run protect-paths.sh "$(edit "$REPO/.env")"
check ".env is blocked" 2 "" "Instead:"
run protect-paths.sh "$(edit "$REPO/.env.local")"
check ".env.local is blocked" 2 "" "env files hold local secrets"
run protect-paths.sh "$(edit "$REPO/.env.example")"
check ".env.example is allowed" 0
run protect-paths.sh "$(edit "$REPO/backend/uv.lock")"
check "uv.lock is blocked" 2 "" "uv add"
run protect-paths.sh "$(edit "$REPO/frontend/package-lock.json")"
check "package-lock.json is blocked" 2 "" "npm install"
run protect-paths.sh "$(edit "$REPO/.github/workflows/ci.yml")"
check "workflow edit asks the human" 0 '"permissionDecision": "ask"'
run protect-paths.sh "$(edit "$REPO/backend/app/main.py")"
check "ordinary file is allowed silently" 0
[ -z "$OUT$ERR" ] || { fail=$((fail + 1)); echo "  ✗ ordinary file produced output"; }
run protect-paths.sh '{"tool_input": {}}'
check "missing file_path is allowed" 0

# ------------------------------------------------------------------ no-secrets
echo "no-secrets.sh"
# Fake keys are built at runtime so this file never contains a literal secret.
aws="AKIA$(repeat Q 16)"
anthropic="sk-ant-$(repeat a 30)"
github="ghp_$(repeat b 36)"
generic="$(repeat Z 30)"

repo=$(new_repo)
echo 'print("hi")' >"$repo/ok.py"
git -C "$repo" add ok.py
run no-secrets.sh "$(bash_cmd 'git commit -m ok')" "$repo"
check "clean staged change is allowed" 0

printf "x = 1\nAWS = '%s'\nk = '%s'\napi_key = \"%s\"\n" "$aws" "$anthropic" "$generic" >"$repo/cfg.py"
git -C "$repo" add cfg.py
run no-secrets.sh "$(bash_cmd 'cd x && git commit -m bad')" "$repo"
check "staged AWS key is blocked" 2 "" "cfg.py:2  AKIA…"
check "staged Anthropic key is blocked" 2 "" "cfg.py:3  sk-a…"
check "generic api_key is blocked" 2 "" "cfg.py:4  api_…"
check "block message says what to do" 2 "" "Instead:"
[[ "$ERR" != *"$aws"* ]] || { fail=$((fail + 1)); echo "  ✗ full key leaked into the message"; }

git -C "$repo" rm -q --cached cfg.py
rm -f "$repo/cfg.py"
git -C "$repo" -c user.name=t -c user.email=t@t commit -q -m ok
echo "t = '$github'" >>"$repo/ok.py"
run no-secrets.sh "$(bash_cmd 'git commit -m x')" "$repo"
check "unstaged secret is not scanned by plain commit" 0
run no-secrets.sh "$(bash_cmd 'git commit -am x')" "$repo"
check "commit -am scans unstaged changes" 2 "" "ok.py:2  ghp_…"
run no-secrets.sh "$(bash_cmd 'git commit --all -m x')" "$repo"
check "commit --all scans unstaged changes" 2 "" "ghp_…"

git -C "$repo" checkout -q ok.py
echo 'token = "dev-only"' >"$repo/t.py"
git -C "$repo" add t.py
run no-secrets.sh "$(bash_cmd 'git commit -m t')" "$repo"
check "short dev value is not a false positive" 0

# ------------------------------------------------------------------- tree-hash
echo "tree-hash.sh"
# not_ok <name> <condition...>: count a failure when the condition holds.
not_ok() {
  local name="$1"
  shift
  if "$@"; then
    fail=$((fail + 1))
    printf '  ✗ %s\n' "$name"
  else
    pass=$((pass + 1))
    printf '  ✓ %s\n' "$name"
  fi
}
th() { (cd "$1" && "$HOOKS/tree-hash.sh"); }

repo=$(new_repo)
echo '*.log' >"$repo/.gitignore"
echo a >"$repo/a.txt"
git -C "$repo" add .gitignore
before_status=$(git -C "$repo" status --porcelain)
t1=$(th "$repo")
not_ok "prints a tree id" test -z "$t1"
not_ok "same files give the same id" test "$(th "$repo")" != "$t1"
not_ok "real index is left alone" test "$(git -C "$repo" status --porcelain)" != "$before_status"
echo noise >"$repo/debug.log"
not_ok "ignored files don't count" test "$(th "$repo")" != "$t1"
git -C "$repo" add -A
git -C "$repo" -c user.name=t -c user.email=t@t commit -q -m all
not_ok "committing everything keeps the id" test "$(git -C "$repo" rev-parse 'HEAD^{tree}')" != "$t1"
echo b >"$repo/b.txt"
not_ok "an untracked file changes the id" test "$(th "$repo")" = "$t1"
rm -f "$repo/b.txt"
echo changed >"$repo/a.txt"
not_ok "an unstaged edit changes the id" test "$(th "$repo")" = "$t1"

# ----------------------------------------------------------------- pre-pr-gate
echo "pre-pr-gate.py"
# A stub `make` on PATH stands in for `make verify` (the real one would recurse).
# Like the real one, a pass records the tree id under .git/pr-gate/.
mkdir -p "$TMP/bin"
cat >"$TMP/bin/make" <<'EOF'
#!/usr/bin/env bash
echo "stub make $*"
[ "${STUB_MAKE_FAIL:-0}" = 1 ] && { echo "FAIL Required test coverage of 95% not reached."; exit 2; }
dir=$(git rev-parse --git-path pr-gate)
mkdir -p "$dir" && touch "$dir/$("$STUB_TREE_HASH")"
echo "✅ VERIFY PASSED"
EOF
chmod +x "$TMP/bin/make"
gate() { PATH="$TMP/bin:$PATH" STUB_TREE_HASH="$HOOKS/tree-hash.sh" STUB_MAKE_FAIL="$1" run pre-pr-gate.py "$2" "$3"; }
stamps() { find "$(git -C "$1" rev-parse --absolute-git-dir)/pr-gate" -type f 2>/dev/null | wc -l | tr -d ' '; }

repo=$(new_repo)
gate 1 "$(bash_cmd 'ls -la')" "$repo"
check "non-PR command passes without running make" 0
[ -z "$ERR" ] || { fail=$((fail + 1)); echo "  ✗ non-PR command ran make"; }
gate 1 "$(bash_cmd 'gh pr view 9')" "$repo"
check "gh pr view is not gated" 0

echo dirty >"$repo/wip.txt"
gate 1 "$(bash_cmd 'cd x && gh pr create -t y')" "$repo"
check "failing verify blocks gh pr create" 2 "" "PR blocked"
check "block shows the failure tail" 2 "" "coverage of 95% not reached"
gate 1 "$(bash_cmd 'gh pr ready 9')" "$repo"
check "failing verify blocks gh pr ready" 2 "" "PR blocked"
not_ok "failing verify records no pass" test "$(stamps "$repo")" != 0
gate 0 "$(bash_cmd 'gh pr create -t y')" "$repo"
check "passing verify allows the PR (dirty tree)" 0 "" "make verify passed"

# From here a rerun would fail (STUB_MAKE_FAIL=1), so exit 0 proves it was skipped.
gate 1 "$(bash_cmd 'gh pr create -t y')" "$repo"
check "same uncommitted files skip the rerun" 0 "" "already passed"
git -C "$repo" add -A
git -C "$repo" -c user.name=t -c user.email=t@t commit -q -m wip
gate 1 "$(bash_cmd 'gh pr create -t y')" "$repo"
check "committing the verified files skips the rerun" 0 "" "already passed"
echo more >>"$repo/wip.txt"
gate 1 "$(bash_cmd 'gh pr create -t y')" "$repo"
check "an edit after verify reruns it" 2 "" "PR blocked"
git -C "$repo" checkout -q wip.txt
echo new >"$repo/new.txt"
gate 1 "$(bash_cmd 'gh pr ready 9')" "$repo"
check "a new untracked file after verify reruns it" 2 "" "PR blocked"

# -------------------------------------------------------------- format-on-edit
echo "format-on-edit.sh"
ruff="$REPO/backend/.venv/bin/ruff"
fe_bin="$REPO/frontend/node_modules/.bin"

run format-on-edit.sh "$(edit "$TMP/does-not-exist.py")"
check "missing file is a silent no-op" 0
run format-on-edit.sh '{"tool_input": {}}'
check "missing file_path is a silent no-op" 0

if [ -x "$ruff" ]; then
  py="$REPO/backend/app/_hooktest_$$.py"
  TEMP_FILES+=("$py")
  printf 'import os\nimport sys\nx = {  "a":1 }\nprint( sys.argv , undefined_name)\n' >"$py"
  run format-on-edit.sh "$(edit "$py")"
  check "python: never blocks" 0
  check "python: unfixable issue goes back as context" 0 "F821"
  grep -q '^import os' "$py" && { fail=$((fail + 1)); echo "  ✗ python: unused import not removed"; }
  grep -q 'x = {"a": 1}' "$py" || { fail=$((fail + 1)); echo "  ✗ python: not formatted"; }
else
  echo "  - skipped python checks (run make setup)"
fi

if [ -x "$fe_bin/eslint" ] && [ -x "$fe_bin/prettier" ]; then
  ts="$REPO/frontend/src/_hooktest_$$.ts"
  TEMP_FILES+=("$ts")
  printf 'const a = {b:1}\nexport const c = a\nexport const d: any = 2\n' >"$ts"
  run format-on-edit.sh "$(edit "$ts")"
  check "typescript: never blocks" 0
  check "typescript: unfixable issue goes back as context" 0 "no-explicit-any"
  grep -q 'const a = { b: 1 }' "$ts" || { fail=$((fail + 1)); echo "  ✗ typescript: not formatted"; }
else
  echo "  - skipped frontend checks (run make setup)"
fi

# --------------------------------------------------------------------- summary
echo
if [ "$fail" -eq 0 ]; then
  echo "✅ hook tests: $pass passed"
else
  echo "❌ hook tests: $fail failed, $pass passed"
  exit 1
fi
