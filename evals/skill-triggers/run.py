#!/usr/bin/env python3
"""Skill trigger evals: run each case in a fresh `claude -p` session and check which skills load.

Usage (repo root):  python3 evals/skill-triggers/run.py [--only api-] [--model sonnet] [--jobs 4]

Each case runs in a throwaway clone of HEAD with no git remote. The clone is an untrusted workspace,
so the project allowlist is ignored and `-p` denies any Bash that would need approval (gh, git push).
Claude keeps its normal tools so tool restrictions don't skew triggering; the session is stopped at
the first Edit/Write, since skills load before code.

Each run appends one line to history.jsonl (committed). Reports and raw transcripts go to
results/<stamp>/ (gitignored) for debugging misses locally.
"""

import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
HISTORY = HERE / "history.jsonl"
DISALLOWED = ["WebFetch", "WebSearch"]
STOP_AT = {"Edit", "Write", "NotebookEdit"}


def description_hashes(skills_dir=REPO / ".claude" / "skills"):
    """Short hash of each model-invoked skill's description, so a score can be tied to its wording."""
    hashes = {}
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        front = skill_md.read_text().split("---")[1]
        if "disable-model-invocation: true" in front:
            continue
        desc = next(line for line in front.splitlines() if line.startswith("description:"))
        hashes[skill_md.parent.name] = hashlib.sha256(desc.encode()).hexdigest()[:8]
    return hashes


def append_history(run, results, only):
    correct = sum(r["correct"] for r in results)
    entry = {"run": run, "model": results[0]["model"], "only": only or None,
             "cases": len(results), "correct": correct, "accuracy": round(correct / len(results), 3),
             "descriptions": description_hashes(),
             "results": [{"id": r["id"], "ok": r["correct"], "loaded": r["skills_loaded"]} for r in results]}
    with HISTORY.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def run_case(case, model, timeout, out_dir):
    work = pathlib.Path(tempfile.mkdtemp(prefix="skill-eval-"))
    try:
        subprocess.run(["git", "clone", "--quiet", "--local", str(REPO), str(work / "repo")], check=True)
        subprocess.run(["git", "-C", str(work / "repo"), "remote", "remove", "origin"], check=True)
        # evaluate the working-tree skills, so description edits can be tested before committing
        shutil.copytree(REPO / ".claude" / "skills", work / "repo" / ".claude" / "skills", dirs_exist_ok=True)
        cmd = ["claude", "-p", case["prompt"], "--output-format", "stream-json", "--verbose",
               "--no-session-persistence", "--max-budget-usd", "1", "--disallowedTools", *DISALLOWED]
        if model:
            cmd += ["--model", model]
        started = time.monotonic()
        proc = subprocess.Popen(cmd, cwd=work / "repo", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        timer = threading.Timer(timeout, proc.kill)
        timer.start()
        lines, skills, tools, session_model, stopped = [], [], [], None, None
        for line in proc.stdout:
            lines.append(line)
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("type") == "system" and ev.get("subtype") == "init":
                session_model = ev.get("model")
            if ev.get("type") == "assistant":
                for block in ev.get("message", {}).get("content", []):
                    if block.get("type") != "tool_use":
                        continue
                    tools.append(block["name"])
                    if block["name"] == "Skill":
                        skills.append(block.get("input", {}).get("skill"))
                    if block["name"] in STOP_AT and not stopped:
                        stopped = "first edit"
                        proc.kill()
        proc.wait()
        if not stopped and not timer.is_alive() and proc.returncode != 0:
            stopped = "timeout"
        timer.cancel()
        (out_dir / "transcripts" / f"{case['id']}.jsonl").write_text("".join(lines))

        loaded = case["skill"] in skills
        return {**case, "skills_loaded": skills, "tools_used": tools, "triggered": loaded,
                "correct": loaded == case["should_trigger"], "model": session_model,
                "stopped": stopped or "finished", "seconds": round(time.monotonic() - started, 1)}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def write_report(results, out_dir, target):
    correct = sum(r["correct"] for r in results)
    acc = correct / len(results)
    by_skill = {}
    for r in results:
        by_skill.setdefault(r["skill"], []).append(r)
    md = [f"# Skill trigger eval — {out_dir.name}", "",
          f"Model: `{results[0]['model']}` · Cases: {len(results)} · Correct: {correct} · "
          f"**Accuracy: {acc:.0%}** (target ≥ {target:.0%}) — {'✅ PASS' if acc >= target else '❌ FAIL'}", "",
          "| Skill | Positives hit | Near-misses avoided | Accuracy |", "|---|---|---|---|"]
    for skill, rs in by_skill.items():
        pos = [r for r in rs if r["should_trigger"]]
        neg = [r for r in rs if not r["should_trigger"]]
        md.append(f"| `{skill}` | {sum(r['triggered'] for r in pos)}/{len(pos)} | "
                  f"{sum(not r['triggered'] for r in neg)}/{len(neg)} | {sum(r['correct'] for r in rs)}/{len(rs)} |")
    md += ["", "| ID | Expect | Target loaded? | Result | All skills loaded | Ended | Prompt |",
           "|---|---|---|---|---|---|---|"]
    for r in results:
        md.append(f"| {r['id']} | {'trigger' if r['should_trigger'] else 'no trigger'} | "
                  f"{'yes' if r['triggered'] else 'no'} | {'✅' if r['correct'] else '❌'} | "
                  f"{', '.join(r['skills_loaded']) or '—'} | {r['stopped']} | {r['prompt'].replace('|', '/')} |")
    (out_dir / "report.md").write_text("\n".join(md) + "\n")
    (out_dir / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    return acc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="run case ids starting with this prefix")
    ap.add_argument("--model", default=None)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--label", default="", help="suffix for the run name")
    ap.add_argument("--no-history", action="store_true", help="don't append to history.jsonl (smoke tests)")
    args = ap.parse_args()

    spec = json.loads((HERE / "cases.json").read_text())
    cases = [c for c in spec["cases"] if c["id"].startswith(args.only)]
    stamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")  # noqa: DTZ005 - eval tooling, not app code
    out_dir = HERE / "results" / (stamp + (f"_{args.label}" if args.label else ""))
    (out_dir / "transcripts").mkdir(parents=True, exist_ok=True)

    with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
        futures = {pool.submit(run_case, c, args.model, args.timeout, out_dir): c["id"] for c in cases}
        for f in concurrent.futures.as_completed(futures):
            r = f.result()
            print(f"{'✅' if r['correct'] else '❌'} {r['id']:<14} loaded={r['skills_loaded']} "
                  f"{r['stopped']} ({r['seconds']}s)", flush=True)
    order = [c["id"] for c in cases]
    results = sorted((f.result() for f in futures), key=lambda r: order.index(r["id"]))
    acc = write_report(results, out_dir, spec["target_accuracy"])
    if not args.no_history:
        append_history(out_dir.name, results, args.only)
    print(f"\nAccuracy {acc:.0%} → {out_dir.relative_to(REPO)}/report.md")


if __name__ == "__main__":
    main()
