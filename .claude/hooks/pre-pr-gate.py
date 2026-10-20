#!/usr/bin/env python3
"""PreToolUse hook: block PR creation unless `make verify` passes.

`make verify` = lint + build + tests with coverage gates (backend 95%,
frontend 90%) + security (uv audit, bandit, npm audit), the same checks CI
runs. Thresholds live in the Makefile and frontend/vite.config.ts; this hook
only reads the exit code. Exit 2 blocks the tool call and sends stderr to Claude.

Every passing `make verify` records the tree id of the files it checked
(tree-hash.sh) under .git/pr-gate/. If the files are still the same (whether
committed since or not), the PR goes through without a rerun.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PR_CMD = re.compile(r"\bgh\s+pr\s+(create|ready)\b")
TREE_HASH = Path(__file__).resolve().parent / "tree-hash.sh"
TAIL_LINES = 40


def run(root: str, *args: str) -> str:
    return subprocess.run(
        list(args), cwd=root, capture_output=True, text=True
    ).stdout.strip()


def main() -> int:
    event = json.load(sys.stdin)
    command = event.get("tool_input", {}).get("command", "")
    if not PR_CMD.search(command):
        return 0

    root = os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or "."

    tree = run(root, str(TREE_HASH))
    stamps = Path(root, run(root, "git", "rev-parse", "--git-path", "pr-gate"))
    if tree and (stamps / tree).exists():
        print(
            f"✅ PR gate: make verify already passed for these files (tree {tree[:7]})",
            file=sys.stderr,
        )
        return 0

    result = subprocess.run(
        ["make", "verify"], cwd=root, capture_output=True, text=True
    )
    if result.returncode != 0:
        tail = "\n".join((result.stdout + result.stderr).splitlines()[-TAIL_LINES:])
        print(
            "⛔ PR blocked: `make verify` failed (lint, coverage gates or security scan).\n"
            "Fix the code, not the test or the threshold, then retry.\n\n" + tail,
            file=sys.stderr,
        )
        return 2

    print("✅ PR gate: make verify passed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
