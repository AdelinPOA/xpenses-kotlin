#!/usr/bin/env python3
"""Rehearse persisted OCR/EXPENSE/RECEIPT crash states on a disposable CI stack.

Never accepts the production container prefix. Uses synthetic PNG bytes and
CI-only fixture credentials; no external OCR provider is required.
"""
import argparse
import base64
import hashlib
import http.cookiejar
import json
import pathlib
import subprocess
import tempfile
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--env-file", required=True)
parser.add_argument("--container-prefix", choices=["xpenses-ci", "xpenses-repair"], required=True)
parser.add_argument("--backend-url", required=True)
parser.add_argument("--origin", required=True)
parser.add_argument("--evidence-file", required=True)
args = parser.parse_args()
values = dict(line.split("=", 1) for line in pathlib.Path(args.env_file).read_text().splitlines() if "=" in line and not line.startswith("#"))
assert values.get("SPRING_PROFILES_ACTIVE") == "ci", "Disposable CI profile required"
assert args.backend_url.startswith(("http://127.0.0.1:", "http://localhost:")), "Loopback backend required"
backend, db = args.container_prefix + "-backend", args.container_prefix + "-db"
base = args.backend_url.rstrip("/") + "/api"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def api(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(base + path, data=data, headers={"Origin": args.origin, "Content-Type": "application/json"})
    return json.load(opener.open(request, timeout=15))


def sql(query):
    return subprocess.check_output(["docker", "exec", db, "sh", "-c", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', "sh", query], text=True).strip()


def login():
    api("/auth/login", {"username": values["CI_TEST_TECHNICIAN_USERNAME"], "password": values["CI_TEST_TECHNICIAN_PASSWORD"]})


login()
owner = api("/auth/me")
assert owner["email"] == owner["username"] + "@ci.invalid" and owner["display_name"] == "CI Technician"
assert owner["username"].startswith(("ci-tech-", "repair-")), "CI-only fixture identity required"
expense = api("/expenses", {"amount": 22, "currency": "EUR", "date": "2026-10-20", "merchant": "Restart fixture"})
known_expense, uid = int(expense["id"]), int(owner["id"])
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII=")
subprocess.run(["docker", "exec", backend, "mkdir", "-p", "/app/data/receipts/ocr-sources"], check=True)
with tempfile.TemporaryDirectory(prefix="ocr-restart-") as directory:
    fixture = pathlib.Path(directory) / "fixture.png"
    fixture.write_bytes(png)
    for stage in ["OCR", "EXPENSE", "RECEIPT"]:
        subprocess.run(["docker", "cp", str(fixture), f"{backend}:/app/data/receipts/ocr-sources/restart-{stage}.png"], check=True, stdout=subprocess.DEVNULL)

# These rows deliberately model committed state left behind by expired workers.
# Stop only the explicitly allowed disposable backend while preparing fixtures.
subprocess.run(["docker", "stop", backend], check=True, stdout=subprocess.DEVNULL)
result = json.dumps({"amount": 22, "currency": "EUR", "date": "2026-10-20", "merchant": "Restart fixture", "tax_amount": 0})
jobs = {}
try:
    for stage in ["OCR", "EXPENSE", "RECEIPT"]:
        expense_id = str(known_expense) if stage == "RECEIPT" else "NULL"
        ocr_result = "NULL" if stage == "OCR" else "'" + result + "'"
        query = (
            "INSERT INTO ocr_jobs(user_id,status,stage,filename,source_path,source_content_type,source_size_bytes,source_sha256,lease_token,lease_until,expires_at,result_json,expense_id) "
            f"VALUES ({uid},'PROCESSING','{stage}','restart-{stage}.png','ocr-sources/restart-{stage}.png','image/png',{len(png)},'{hashlib.sha256(png).hexdigest()}',"
            f"'dead-worker',now()-interval '2 minutes',now()+interval '1 day',{ocr_result},{expense_id}) RETURNING id;"
        )
        jobs[stage] = int(sql(query).splitlines()[0])
finally:
    subprocess.run(["docker", "start", backend], check=True, stdout=subprocess.DEVNULL)

for _ in range(120):
    try:
        if api("/health")["status"] == "ok":
            break
    except (OSError, ValueError):
        pass
    time.sleep(1)
else:
    raise AssertionError("Disposable backend did not restart")
login()
for stage, job_id in jobs.items():
    for _ in range(90):
        job = api(f"/ocr/jobs/{job_id}")
        if job["status"] == "COMPLETED":
            break
        time.sleep(1)
    else:
        raise AssertionError(f"{stage} did not recover: status={job['status']} error={job['error_code']}")
    assert job["expense_id"] and job["receipt_id"]
    if stage == "RECEIPT":
        assert job["expense_id"] == known_expense, "Known Expense was replaced"
    assert len(api(f"/expenses/{job['expense_id']}")["receipts"]) == 1, "Duplicate Receipt"
    print(f"{stage}: expired-worker restart recovered same job; one Receipt; known IDs preserved")
pathlib.Path(args.evidence_file).write_text(json.dumps({"result": "passed", "stages": list(jobs), "receipt_stage_known_expense_preserved": True, "fixture_type": "persisted expired-worker states; disposable backend restart"}, indent=2))
