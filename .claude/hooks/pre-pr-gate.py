#!/usr/bin/env python3
"""PreToolUse hook: block PR creation unless `make verify` passes.

`make verify` = lint + tests with coverage gates (backend 95%, frontend 90%)
+ security (uv audit, bandit, npm audit), the same checks CI runs.
Thresholds live in the Makefile and frontend/vite.config.ts; this hook only
reads the exit code. Exit 2 blocks the tool call and sends stderr to Claude.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PR_CMD = re.compile(r"\bgh\s+pr\s+(create|ready)\b")
TAIL_LINES = 40


def git(root: str, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True
    ).stdout.strip()


def main() -> int:
    event = json.load(sys.stdin)
    command = event.get("tool_input", {}).get("command", "")
    if not PR_CMD.search(command):
        return 0

    root = os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or "."

    # A clean tree at a commit that already passed needs no rerun
    # (e.g. retrying `gh pr create` after an auth or network error).
    head = git(root, "rev-parse", "HEAD")
    clean = git(root, "status", "--porcelain") == ""
    stamp = Path(root, git(root, "rev-parse", "--git-path", "pr-gate"), head)
    if clean and stamp.exists():
        print(f"✅ PR gate: make verify already passed at {head[:7]}", file=sys.stderr)
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

    if clean:
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.touch()
    print("✅ PR gate: make verify passed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
