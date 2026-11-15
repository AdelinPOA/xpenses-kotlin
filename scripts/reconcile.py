#!/usr/bin/env python3
"""Xpenses Continuous Telemetry & Pre-Commit Drift Engine."""

import argparse
import pathlib
import re
import shutil
import subprocess
import sys
from collections import Counter

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
README_PATH = REPO_ROOT / "README.md"
MIGRATIONS_DIR = REPO_ROOT / "backend-kotlin-jpa/src/main/resources/db/migration"
CONTROLLERS_DIR = REPO_ROOT / "backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers"
FRONTEND_APP_DIR = REPO_ROOT / "frontend/app"
COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"

START_MARKER = "<!-- BEGIN:XPENSES_AUTOSYNC:TELEMETRY -->"
END_MARKER = "<!-- END:XPENSES_AUTOSYNC:TELEMETRY -->"


def _git_head() -> tuple[str, str]:
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, text=True
        ).strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=REPO_ROOT, text=True
        ).strip()
        return branch, sha
    except Exception:
        return "unknown", "unknown"


def _migration_stats() -> tuple[int, str, list[str]]:
    if not MIGRATIONS_DIR.exists():
        return 0, "none", []
    versions: list[tuple[int, str]] = []
    for p in MIGRATIONS_DIR.glob("V*__*.sql"):
        m = re.match(r"^V(\d+)__", p.name)
        if m:
            versions.append((int(m.group(1)), p.name))
    versions.sort(key=lambda x: x[0])
    counts = Counter(v for v, _ in versions)
    dups = [f"V{v}" for v, c in counts.items() if c > 1]
    latest = versions[-1][1] if versions else "none"
    return len(versions), latest, dups


def _compose_services() -> list[str]:
    if not COMPOSE_FILE.exists():
        return []
    services: list[str] = []
    in_services = False
    for line in COMPOSE_FILE.read_text(encoding="utf-8").splitlines():
        if re.match(r"^services:\s*$", line):
            in_services = True
            continue
        if in_services:
            if line and not line[0].isspace():
                break
            m = re.match(r"^  ([a-zA-Z0-9_-]+):\s*$", line)
            if m:
                services.append(m.group(1))
    return services


def render_telemetry_block() -> str:
    branch, sha = _git_head()
    mig_count, latest_mig, _ = _migration_stats()
    controllers = len(list(CONTROLLERS_DIR.glob("*Controller.kt"))) if CONTROLLERS_DIR.exists() else 0
    routes = len(list(FRONTEND_APP_DIR.rglob("page.tsx"))) if FRONTEND_APP_DIR.exists() else 0
    services = _compose_services()
    services_str = ", ".join(f"`{s}`" for s in services) if services else "none"

    return (
        f"{START_MARKER}\n"
        "| Telemetry Metric | Live Repository State |\n"
        "|---|---|\n"
        f"| **Git Baseline** | `{branch}` @ `{sha}` |\n"
        f"| **Flyway Migrations** | {mig_count} scripts (latest: `{latest_mig}`) |\n"
        f"| **Backend Controllers** | {controllers} `*Controller.kt` files |\n"
        f"| **Frontend Routes** | {routes} Next.js `page.tsx` routes |\n"
        f"| **Compose Services** | {services_str} |\n"
        f"{END_MARKER}"
    )


def run_reconcile() -> int:
    if not README_PATH.exists():
        print(f"[!] {README_PATH} not found.", file=sys.stderr)
        return 1

    content = README_PATH.read_text(encoding="utf-8")
    pattern = re.compile(rf"{re.escape(START_MARKER)}.*?{re.escape(END_MARKER)}", re.DOTALL)
    new_block = render_telemetry_block()

    if not pattern.search(content):
        print("[!] Bounded telemetry markers not found in README.md; skipping update.", file=sys.stderr)
        return 0

    updated = pattern.sub(lambda _: new_block, content, count=1)
    if updated != content:
        README_PATH.write_text(updated, encoding="utf-8")
        print("[+] Reconciled README.md telemetry block.")
    else:
        print("[=] README.md telemetry block already up to date.")
    return 0


def run_audit() -> int:
    errors: list[str] = []

    if README_PATH.exists():
        content = README_PATH.read_text(encoding="utf-8")
        pattern = re.compile(rf"{re.escape(START_MARKER)}.*?{re.escape(END_MARKER)}", re.DOTALL)
        m = pattern.search(content)
        if not m:
            errors.append("README.md is missing BEGIN/END XPENSES_AUTOSYNC:TELEMETRY markers.")
        elif m.group(0) != render_telemetry_block():
            errors.append("README.md telemetry block is out of sync. Run: python3 scripts/reconcile.py reconcile")

    _, _, dups = _migration_stats()
    if dups:
        errors.append(f"Duplicate Flyway migration version(s): {chr(44).join(dups)}")

    node = shutil.which("node")
    if node:
        for script in ("scripts/check-i18n-parity.mjs", "scripts/check-format-currency.mjs"):
            script_path = REPO_ROOT / script
            if script_path.exists():
                res = subprocess.run([node, str(script_path)], cwd=REPO_ROOT, capture_output=True, text=True)
                if res.returncode != 0:
                    errors.append(f"{script} failed:\n{res.stdout}\n{res.stderr}".strip())

    if errors:
        print("\n[!] AUDIT FAILED:", file=sys.stderr)
        for err in errors:
            print(f"    - {err}", file=sys.stderr)
        return 1

    print("[+] Audit passed: README telemetry, Flyway versions, i18n parity, and currency checks aligned.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Xpenses Continuous Telemetry & Drift Engine")
    parser.add_argument("command", choices=["reconcile", "audit"])
    args = parser.parse_args()
    return run_reconcile() if args.command == "reconcile" else run_audit()


if __name__ == "__main__":
    sys.exit(main())
