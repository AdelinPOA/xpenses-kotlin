# GUI-managed AI providers and model chains — 2026-10-16

Tracking: [GitHub issue #53](https://github.com/AdelinPOA/xpenses-kotlin/issues/53).

## Delivered

Moderators can add/edit compatible AI providers and models from `/admin/ocr`, test models before activation, deactivate obsolete models, and maintain separate ordered receipt-OCR and delegation-email chains. Provider keys are encrypted and write-only. New compatible model releases no longer require editing a hardcoded selector or fallback list and redeploying.

- [Administrator guide, API, compatibility, and limits](../ocr-model-management.md)
- [Architecture decision](../adr/0006-gui-managed-ai-provider-model-chains.md)
- [Domain vocabulary](../../CONTEXT.md)

The existing `ocr_config` setting is converted from legacy Gemini configuration on read; the next settings write persists the catalog. No new Flyway migration was added. Model selection now controls actual execution, with chain-aware cache identity and successful provider/model attribution in comparison history.

## Verification fixes included before deployment

Independent review found and corrected these release blockers before the final images were built:

- Legacy API-key migration attempted to decrypt a plaintext key a second time. Real-crypto migration/save/read tests now cover the conversion.
- Long provider/model labels could exceed the comparison table's existing 50-character column. Both new and cached comparison paths respect that bound.
- A model test could overwrite configuration changed during its provider request. Test completion now reloads settings under a short PostgreSQL advisory lock, verifies the tested definition/credential, and merges only the test result. Provider I/O remains outside the transaction.
- Failed retests retained an old successful-test flag. Failure now revokes it; changed definitions discard stale test results.
- Raw external errors could disclose provider response content. Transport/service errors are sanitized and do not retain raw provider/network causes.
- Preflight-only DNS checking left a rebinding gap. The actual HTTP connection uses a validating public-address resolver, with normal TLS hostname/certificate verification, direct routing, redirects/retries disabled, and bounded waits.
- Background refreshes and mutation completion could discard unsaved GUI edits. Dirty drafts are preserved, save/test operations lock editing, and test completion includes the authoritative settings refresh.
- Delegation validation now rejects invalid/reversed calendar dates and incomplete required fields before accepting a result instead of trying the next model.

## Verification evidence

Completed against the implementation deployed on 2026-10-16:

| Check | Result |
| --- | --- |
| Focused JUnit tests: OCR service, delegation service, transport, settings controller, catalog integration | **33 passed**, no failures/errors |
| Catalog integration | Real Spring Security, repositories, PostgreSQL advisory-lock query, and encryption; only provider network I/O mocked |
| Playwright OCR + IMAP specs, desktop + mobile Chromium, one worker | **26 passed** |
| Frontend TypeScript check | Passed |
| English/Romanian translation parity | Passed, 964 keys per locale |
| Backend and frontend production Docker builds | Passed, built sequentially |
| Whitespace check | `git diff --check` passed |

The PostgreSQL integration database was isolated and resource-limited. Tests did not modify production data. Browser lifecycle tests used mocked APIs. A final browser smoke check loaded the deployed production assets and rendered provider/model controls and both chains without page errors; its APIs were mocked and read-only.

No live AI-provider calls or paid OCR requests were performed as part of this verification. Actual endpoint/model compatibility is checked when a moderator explicitly runs **Test model**. Full multi-container suites were not run. ESLint did not supply matching configuration for the selected TypeScript files, so it is not counted as a successful lint verification. Existing Next.js middleware/time-zone warnings and unmocked IMAP recovery polling in the browser fixtures were non-failing test-environment warnings.

## Production rollout and smoke checks

Before rebuilding, a restricted server-local PostgreSQL custom-format backup was created and its archive listing verified. Previous application images were retained with a `pre-ocr-<UTC timestamp>` tag. The running backend's original image had already been removed before this work, so its application filesystem was snapshotted without pausing the container to preserve a rollback image; mounted persistent data was not included. Backup/image manifests and build/startup logs remain server-local, not in Git.

The backend and frontend images were built sequentially while the previous services remained available. Deployment recreated only those two services using `docker compose up -d --no-deps --no-build --wait`; there were no processing OCR jobs at the pre-restart check. Existing frontend/backend port bindings were preserved.

Post-deploy checks passed:

- Backend and frontend Docker health checks: **healthy**.
- Local and public `/api/health`: HTTP 200, `{"status":"ok"}`.
- Public `/login`: HTTP 200.
- Anonymous `/api/settings/ocr`: HTTP 401, with no catalog/credential disclosure.
- Frontend-container access to `http://backend:8080/api/health`: HTTP 200.
- Backend/frontend startup logs: no `ERROR`, application-startup failure, or out-of-memory entries at the smoke-check point.
- PostgreSQL and Redis container IDs and start times were unchanged. Their volumes were not removed or recreated. Production Flyway history was already at V103 before rollout.

No `docker compose down`, volume deletion, or database restore was used.

## Rollback and remaining limits

Retained application images permit application rollback without stopping PostgreSQL or Redis. Select the matching server-local `pre-ocr-<timestamp>` tags, preserve the recorded port bindings, and recreate only backend/frontend with `--no-deps --no-build --wait` after confirming the selected images.

**Catalog rollback needs separate consideration:** an older backend does not understand the new catalog settings contract. If catalog settings have been saved after this rollout, an image rollback alone does not restore legacy OCR settings. Plan a narrowly scoped restoration/conversion of `ocr_config` from the protected pre-deploy backup, retaining newer settings for recovery. Do not overwrite the live database with a full old dump just to revert this feature; that would discard unrelated expense activity. Do not change the encryption secret or rewrite applied migrations.

Known limits are documented in the administrator guide: public HTTPS compatible APIs only, multimodal testing required for every new model, first-five-page PDF processing, per-request rather than chain-wide timeouts, and last-writer-wins full-catalog saves from different browser sessions. No zero-downtime or live-provider-accuracy guarantee is implied by the health checks.
