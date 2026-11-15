# Scripts

## Overview
Operational, CI verification, and developer tooling scripts for the `xpenses-kotlin` workspace. This package groups database backup automation (`backup-db.sh`), frontend currency formatting and i18n parity checks (`check-format-currency.mjs`, `check-i18n-parity.mjs`), npm audit policy enforcement (`check-npm-audit.mjs`), full Graphify knowledge-graph construction (`run_graphify_full.py`), and disposable CI OCR restart-recovery verification (`verify-ocr-restart.py`).

## Interface
- `[backup-db.sh:set -euo pipefail]` — Bash strict-mode CLI entrypoint (`-euo pipefail`) that dumps PostgreSQL from Docker and prunes expired backups.
- `[backup-db.sh:BACKUP_DIR]` — Environment variable for output dump directory (default `/backups`).
- `[backup-db.sh:DB_CONTAINER]` — Environment variable for PostgreSQL Docker container name (default `xpenses-db`).
- `[backup-db.sh:DB_USER]` — Environment variable for `pg_dump -U` user (default `xpenses`).
- `[backup-db.sh:DB_NAME]` — Environment variable for `pg_dump` database name (default `xpenses`).
- `[backup-db.sh:RETENTION_DAYS]` — Environment variable for backup retention window in days (default `90`).
- `[check-format-currency.mjs:mapLocaleToBcp47]` — Locale mapping `{ en: "en-EU", ro: "ro-RO" }`.
- `[check-format-currency.mjs:formatCurrency]` — `formatCurrency(amount, currency = "EUR", locale = "en")` returning an `Intl.NumberFormat` currency string.
- `[check-format-currency.mjs:assert]` — `assert(cond, msg)` helper tracking failed assertion count.
- `[check-format-currency.mjs:process.exit]` — CLI entrypoint exiting `0` when `failed === 0` or `1` when `failed > 0`.
- `[check-i18n-parity.mjs:messagesDir]` — Path resolved to `../frontend/messages` relative to `import.meta.dirname`.
- `[check-i18n-parity.mjs:getKeys]` — `getKeys(obj, prefix = "")` returning flattened dot-delimited key paths.
- `[check-i18n-parity.mjs:process.exit]` — CLI entrypoint exiting `0` when `en.json` and `ro.json` keys match, or `1` on parity mismatch or read/parse error.
- `[check-npm-audit.mjs:process.argv]` — Positional CLI argument `process.argv[2]` specifying the audit JSON report path (default `"npm-audit.json"`).
- `[check-npm-audit.mjs:hasFix]` — `hasFix(vulnerability)` returning `true` when `fixAvailable` is `true` or a non-null object.
- `[check-npm-audit.mjs:process.exit]` — CLI entrypoint exiting `1` when any fixable `high` or `critical` vulnerability is found or on report error, otherwise `0`.
- `[run_graphify_full.py:main]` — `main()` CLI entrypoint taking no CLI arguments and operating on `CWD/graphify-out`.
- `[run_graphify_full.py:sys.exit]` — Exits with status `1` if `.graphify_detect.json` or `.graphify_ast.json` is missing, or if the built graph has `0` nodes.
- `[verify-ocr-restart.py:ApiError]` — `RuntimeError` subclass storing HTTP status code in `self.status`.
- `[verify-ocr-restart.py:loopback_url]` — `loopback_url(value)` validating and returning a `urlsplit` result for strict loopback HTTP URLs.
- `[verify-ocr-restart.py:load_fixture]` — `load_fixture(path)` parsing a `KEY=VALUE` env file into a dictionary.
- `[verify-ocr-restart.py:positive_id]` — `positive_id(value)` validating and returning an integer `>= 1`.
- `[verify-ocr-restart.py:Client]` — `Client(backend_url, origin)` with `api(path, body=None)` sending `GET`/`POST` requests to `/api` + `path` while maintaining session cookies.
- `[verify-ocr-restart.py:validate_owner]` — `validate_owner(owner, username)` validating `/auth/me` payload and returning the positive integer user ID.
- `[verify-ocr-restart.py:sql]` — `sql(db, query, **values)` executing `psql` inside Docker container `db` and returning stripped stdout.
- `[verify-ocr-restart.py:poll]` — `poll(fetch, ready, attempts, wait=time.sleep)` polling until `ready(value)` is truthy or raising `TimeoutError`.
- `[verify-ocr-restart.py:INSERT_JOB]` — SQL statement inserting an expired-lease `PROCESSING` row into `ocr_jobs` returning `id`.
- `[verify-ocr-restart.py:run]` — `run(args)` orchestrating the disposable CI OCR restart rehearsal.
- `[verify-ocr-restart.py:main]` — CLI entrypoint requiring `--env-file`, `--container-prefix` (`xpenses-ci` or `xpenses-repair`), `--backend-url`, `--origin`, and `--evidence-file`.

## Invariants
- `[backup-db.sh:set -euo pipefail]` — Strict bash mode aborts on unset variables, pipeline errors, or non-zero command exits.
- `[backup-db.sh:FILENAME]` — Database dumps use custom `pg_dump` format (`-Fc`) named `xpenses_YYYYMMDD_HHMMSS.dump`.
- `[check-format-currency.mjs:formatCurrency]` — Formats with `style: "currency"`, `currencyDisplay: "narrowSymbol"`, `minimumFractionDigits: 2`, `maximumFractionDigits: 2`, falling back unknown locales to `"en-EU"`.
- `[check-format-currency.mjs:assert]` — Formatted values for `formatCurrency(1234.56, "EUR", "en")` and `"ro"` must match `/1[,.]234[,.]56/` and contain `"€"`.
- `[check-i18n-parity.mjs:getKeys]` — Recurses only into non-null, non-array objects; arrays and primitives are treated as leaf keys.
- `[check-i18n-parity.mjs:missingInRo]` — Enforces symmetric key parity between `en.json` and `ro.json` (`missingInRo.length === 0 && missingInEn.length === 0`).
- `[check-npm-audit.mjs:report]` — Parsed audit JSON must include a non-null object `report.vulnerabilities` map.
- `[check-npm-audit.mjs:blocking]` — Audit policy fails only on vulnerabilities with `severity` in `["high", "critical"]` where `hasFix(vulnerability)` is `true`.
- `[run_graphify_full.py:detect_file]` — Requires `graphify-out/.graphify_detect.json` and `graphify-out/.graphify_ast.json` to exist prior to graph construction.
- `[run_graphify_full.py:non_code_files]` — Semantic extraction processes only `"document"` and `"image"` categories with `backend="gemini"`, `chunk_size=20`, `token_budget=60_000`, `max_concurrency=4`.
- `[run_graphify_full.py:seen_nodes]` — Node merge deduplicates by `n["id"]` keeping AST nodes before semantic nodes; resulting graph must be undirected (`directed=False`) and non-empty (`number_of_nodes() > 0`).
- `[verify-ocr-restart.py:loopback_url]` — URLs must use `http` scheme, hostname in `{"localhost", "127.0.0.1", "::1"}`, explicit port `1..65535`, no userinfo, path in `{"", "/"}`, and no whitespace, backslashes, query, or fragment.
- `[verify-ocr-restart.py:load_fixture]` — Env fixture must specify `SPRING_PROFILES_ACTIVE=ci`, `CI_TEST_TECHNICIAN_USERNAME` starting with `"ci-tech-"` or `"repair-"`, and non-empty `CI_TEST_TECHNICIAN_PASSWORD`.
- `[verify-ocr-restart.py:run]` — `--container-prefix` must be `"xpenses-ci"` or `"xpenses-repair"`; all local/env guards execute before any HTTP, Docker, or DB mutations.
- `[verify-ocr-restart.py:Client.api]` — Redirects are disabled; requires HTTP `200 <= status < 300` and a JSON object (`dict`) response.
- `[verify-ocr-restart.py:validate_owner]` — Authenticated user must match `username`, `email == username + "@ci.invalid"`, `display_name == "CI Technician"`, and have a positive integer `id`.
- `[verify-ocr-restart.py:poll]` — Requires `attempts >= 1`; health polling tolerates HTTP `>= 500` or connection errors during backend restart, but re-raises 4xx `ApiError`.
- `[verify-ocr-restart.py:run]` — Each stage (`OCR`, `EXPENSE`, `RECEIPT`) must reach `COMPLETED`, preserve `known_expense` for the `RECEIPT` stage, and yield exactly `1` receipt on `/expenses/{expense_id}`.

## Side Effects
- `[backup-db.sh:mkdir]` — Creates `${BACKUP_DIR}` on the filesystem.
- `[backup-db.sh:docker exec]` — Runs `pg_dump` inside Docker container `${DB_CONTAINER}` and writes `${BACKUP_DIR}/xpenses_${TIMESTAMP}.dump`.
- `[backup-db.sh:find]` — Deletes `xpenses_*.dump` files older than `${RETENTION_DAYS}` days in `${BACKUP_DIR}`.
- `[backup-db.sh:ls]` — Prints progress, file size, and trailing backup listing to stdout.
- `[check-format-currency.mjs:console.log]` — Writes assertion results and formatted sample outputs to stdout/stderr.
- `[check-i18n-parity.mjs:readFileSync]` — Reads `../frontend/messages/en.json` and `../frontend/messages/ro.json`.
- `[check-i18n-parity.mjs:console.error]` — Prints parity status or missing key diagnostics to stdout/stderr.
- `[check-npm-audit.mjs:readFileSync]` — Reads the audit JSON report from `reportPath`.
- `[check-npm-audit.mjs:console.error]` — Prints audit policy pass/failure/error diagnostics to stdout/stderr.
- `[run_graphify_full.py:out_dir.mkdir]` — Creates `graphify-out/` and reads `.graphify_detect.json`, `.graphify_ast.json`, and existing `cost.json`.
- `[run_graphify_full.py:extract_corpus_parallel]` — Calls remote Gemini LLM APIs for semantic extraction and community labeling.
- `[run_graphify_full.py:subprocess.check_output]` — Runs `git rev-parse HEAD`.
- `[run_graphify_full.py:write_text]` — Writes `.graphify_semantic.json`, `.graphify_extract.json`, `.graphify_labels.json`, `graph.json`, `GRAPH_REPORT.md`, `graph.html`, and `cost.json` in `graphify-out/` and prints status to stdout/stderr.
- `[verify-ocr-restart.py:load_fixture]` — Reads `--env-file` from the filesystem.
- `[verify-ocr-restart.py:Client.api]` — Sends HTTP `GET`/`POST` requests to loopback endpoints (`/api/auth/login`, `/api/auth/me`, `/api/expenses`, `/api/health`, `/api/ocr/jobs/{job_id}`, `/api/expenses/{expense_id}`).
- `[verify-ocr-restart.py:subprocess.run]` — Creates a temporary PNG file via `tempfile.TemporaryDirectory`, and runs `docker exec mkdir`, `docker cp`, `docker stop`, and `docker start` on `<container-prefix>-backend`.
- `[verify-ocr-restart.py:sql]` — Executes `docker exec psql` against `<container-prefix>-db` to insert 3 expired-lease `PROCESSING` rows into `ocr_jobs`.
- `[verify-ocr-restart.py:write_text]` — Writes the JSON evidence file to `--evidence-file` and prints verification summary lines to stdout.

## Verification
- Run: `cd frontend && npm run i18n:check`
- Run: `node --test scripts/check-i18n-parity.test.mjs scripts/check-npm-audit.test.mjs`
- Run: `python3 -m unittest scripts/test_verify_ocr_restart.py`
