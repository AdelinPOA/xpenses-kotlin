#!/usr/bin/env python3
"""Rehearse persisted crash states on a disposable CI stack, never production."""
import argparse
import base64
import hashlib
import http.client
import json
import pathlib
import subprocess
import tempfile
import time
from http.cookies import SimpleCookie
from urllib.parse import urlsplit


class ApiError(RuntimeError):
    def __init__(self, status):
        super().__init__(f"Disposable API returned HTTP {status}")
        self.status = status


def loopback_url(value):
    """Validate the actual destination, not a prefix that can contain userinfo."""
    if any(character.isspace() for character in value) or "\\" in value or "?" in value or "#" in value:
        raise ValueError("Loopback URL must not contain whitespace, escapes or suffixes")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise ValueError("Invalid loopback URL") from error
    if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or port is None or not 1 <= port <= 65535 or parsed.username is not None
            or parsed.password is not None or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment):
        raise ValueError("Explicit loopback HTTP host and port required; no credentials or URL suffixes")
    return parsed


def load_fixture(path):
    try:
        lines = pathlib.Path(path).read_text().splitlines()
    except (OSError, UnicodeError) as error:
        raise ValueError("Cannot read disposable fixture environment") from error
    values = {}
    for line in lines:
        if not line.strip() or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError("Malformed fixture environment")
        key, value = line.split("=", 1)
        values[key] = value
    if values.get("SPRING_PROFILES_ACTIVE") != "ci":
        raise ValueError("Disposable CI profile required")
    if not values.get("CI_TEST_TECHNICIAN_USERNAME", "").startswith(("ci-tech-", "repair-")):
        raise ValueError("CI-only fixture username required")
    if not values.get("CI_TEST_TECHNICIAN_PASSWORD"):
        raise ValueError("CI fixture password required")
    return values


def positive_id(value):
    if isinstance(value, bool) or not (isinstance(value, int) or isinstance(value, str) and value.isdecimal()):
        raise ValueError("Expected a positive fixture ID")
    try:
        number = int(value)
    except (ValueError, TypeError) as error:
        raise ValueError("Expected a positive fixture ID") from error
    if number < 1:
        raise ValueError("Expected a positive fixture ID")
    return number


class Client:
    """Fixed-destination HTTP client. Redirects are errors, never followed."""
    def __init__(self, backend_url, origin):
        self.target = loopback_url(backend_url)
        loopback_url(origin)
        self.origin = origin.rstrip("/")
        self.cookies = {}

    def api(self, path, body=None):
        connection = http.client.HTTPConnection(self.target.hostname, self.target.port, timeout=15)
        headers = {"Origin": self.origin, "Content-Type": "application/json"}
        if self.cookies:
            headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in self.cookies.items())
        try:
            connection.request("GET" if body is None else "POST", "/api" + path,
                               body=None if body is None else json.dumps(body), headers=headers)
            response = connection.getresponse()
            if not 200 <= response.status < 300:
                raise ApiError(response.status)
            for key, value in response.getheaders():
                if key.lower() == "set-cookie":
                    cookie = SimpleCookie(value)
                    for name, morsel in cookie.items():
                        if morsel["max-age"] == "0":
                            self.cookies.pop(name, None)
                        else:
                            self.cookies[name] = morsel.coded_value
            try:
                result = json.loads(response.read())
            except (ValueError, UnicodeError) as error:
                raise ValueError("Disposable API returned invalid JSON") from error
            if not isinstance(result, dict):
                raise ValueError("Disposable API must return a JSON object")
            return result
        finally:
            connection.close()


def validate_owner(owner, username):
    if (owner.get("username") != username or owner.get("email") != username + "@ci.invalid"
            or owner.get("display_name") != "CI Technician"):
        raise ValueError("Authenticated identity is not the requested disposable CI fixture")
    return positive_id(owner.get("id"))


def sql(db, query, **values):
    options = [item for key, value in values.items() for item in ("-v", f"{key}={value}")]
    return subprocess.check_output([
        "docker", "exec", "-i", db, "sh", "-c",
        'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 "$@"',
        "sh", *options,
    ], input=query, text=True).strip()


def poll(fetch, ready, attempts, wait=time.sleep):
    if attempts < 1:
        raise ValueError("Polling requires at least one attempt")
    for attempt in range(attempts):
        value = fetch()
        if ready(value):
            return value
        if attempt + 1 < attempts:
            wait(1)
    raise TimeoutError("Disposable backend did not reach the required state")


INSERT_JOB = """
INSERT INTO ocr_jobs(user_id,status,stage,filename,source_path,source_content_type,
source_size_bytes,source_sha256,lease_token,lease_until,expires_at,result_json,expense_id)
VALUES (:'uid'::integer,'PROCESSING',:'stage',:'filename',:'source_path','image/png',
:'size'::bigint,:'sha','dead-worker',now()-interval '2 minutes',now()+interval '1 day',
nullif(:'ocr_result',''),nullif(:'expense_id','')::integer) RETURNING id;
"""


def run(args):
    # All local/environment guards precede HTTP, Docker and fixture mutations.
    loopback_url(args.backend_url)
    loopback_url(args.origin)
    if args.container_prefix not in {"xpenses-ci", "xpenses-repair"}:
        raise ValueError("Disposable container prefix required")
    values = load_fixture(args.env_file)
    client = Client(args.backend_url, args.origin)
    backend, db = args.container_prefix + "-backend", args.container_prefix + "-db"

    def login():
        client.api("/auth/login", {"username": values["CI_TEST_TECHNICIAN_USERNAME"],
                                   "password": values["CI_TEST_TECHNICIAN_PASSWORD"]})

    login()
    uid = validate_owner(client.api("/auth/me"), values["CI_TEST_TECHNICIAN_USERNAME"])
    expense = client.api("/expenses", {"amount": 22, "currency": "EUR", "date": "2026-10-20", "merchant": "Restart fixture"})
    known_expense = positive_id(expense.get("id"))
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII=")
    stages = ("OCR", "EXPENSE", "RECEIPT")
    subprocess.run(["docker", "exec", backend, "mkdir", "-p", "/app/data/receipts/ocr-sources"], check=True)
    with tempfile.TemporaryDirectory(prefix="ocr-restart-") as directory:
        fixture = pathlib.Path(directory) / "fixture.png"
        fixture.write_bytes(png)
        for stage in stages:
            subprocess.run(["docker", "cp", str(fixture), f"{backend}:/app/data/receipts/ocr-sources/restart-{stage}.png"], check=True, stdout=subprocess.DEVNULL)

    subprocess.run(["docker", "stop", backend], check=True, stdout=subprocess.DEVNULL)
    result = json.dumps({"amount": 22, "currency": "EUR", "date": "2026-10-20", "merchant": "Restart fixture", "tax_amount": 0})
    jobs = {}
    try:
        for stage in stages:
            returned = sql(db, INSERT_JOB, uid=uid, stage=stage, filename=f"restart-{stage}.png",
                           source_path=f"ocr-sources/restart-{stage}.png", size=len(png), sha=hashlib.sha256(png).hexdigest(),
                           ocr_result="" if stage == "OCR" else result,
                           expense_id=known_expense if stage == "RECEIPT" else "")
            jobs[stage] = positive_id(returned.splitlines()[0])
    finally:
        subprocess.run(["docker", "start", backend], check=True, stdout=subprocess.DEVNULL)

    def health():
        try:
            return client.api("/health").get("status") == "ok"
        except ApiError as error:
            if error.status < 500:
                raise
            return False
        except (OSError, http.client.HTTPException):
            return False

    poll(health, bool, 120)
    login()
    validate_owner(client.api("/auth/me"), values["CI_TEST_TECHNICIAN_USERNAME"])
    for stage, job_id in jobs.items():
        job = poll(lambda job_id=job_id: client.api(f"/ocr/jobs/{job_id}"), lambda item: item.get("status") == "COMPLETED", 90)
        expense_id, _receipt_id = positive_id(job.get("expense_id")), positive_id(job.get("receipt_id"))
        if stage == "RECEIPT" and expense_id != known_expense:
            raise RuntimeError("Known Expense was replaced")
        receipts = client.api(f"/expenses/{expense_id}").get("receipts")
        if not isinstance(receipts, list) or len(receipts) != 1:
            raise RuntimeError("Expected exactly one Receipt")
        print(f"{stage}: expired-worker restart recovered same job; one Receipt; known IDs preserved")
    evidence = {"result": "passed", "stages": list(jobs), "receipt_stage_known_expense_preserved": True,
                "fixture_type": "persisted expired-worker states; disposable backend restart"}
    pathlib.Path(args.evidence_file).write_text(json.dumps(evidence, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--container-prefix", choices=["xpenses-ci", "xpenses-repair"], required=True)
    parser.add_argument("--backend-url", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--evidence-file", required=True)
    run(parser.parse_args())


if __name__ == "__main__":
    main()
