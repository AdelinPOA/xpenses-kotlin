## Context

OCR currently runs through `OcrService.scanReceipt()`, which tries the configured provider (`gemini` by default in practice, though `OCRConfig.provider` defaults to `"easyocr"`) and falls back to a separate `ocr-sidecar` microservice (FastAPI + EasyOCR, preloaded `en`/`ro` models) whenever Gemini errors or returns empty fields. Both results are persisted to `ocr_comparisons` for accuracy tracking, surfaced on `/admin/ocr`. The admin dashboard shows EasyOCR is dramatically less accurate than Gemini (66.67%/0%/0%/33.33% vs ~100% across amount/date/merchant/category), and the sidecar is the only Python/non-JVM service in the stack, requiring its own Dockerfile, dependency set, and model-cache volume.

This change removes EasyOCR and the sidecar entirely. To avoid trading "local fallback" for "no fallback at all," Gemini gains its own internal fallback: an ordered chain of model tiers tried in sequence within a single scan request.

## Goals / Non-Goals

**Goals:**
- Delete the `ocr-sidecar` service, its Dockerfile/requirements/code, and its `docker-compose.yml` wiring.
- Delete all EasyOCR-specific code paths, DB columns, and UI elements.
- Replace the single Gemini call with an ordered multi-tier fallback chain so a single model's outage/rate-limit doesn't fail the whole scan.
- Keep the existing async job/polling mechanics (`AsyncOcrService`, `ocr_jobs` table) unchanged — only the synchronous-call behavior inside the job changes.

**Non-Goals:**
- No new OCR provider (e.g. Ollama, Hybrid OCR+LLM) is being added — those remain "Coming Soon" placeholders in the dropdown.
- No change to the receipt upload flow, drag-and-drop UI, or autofill behavior beyond what fields populate on failure.
- No retry/backoff *within* a single model tier (e.g. exponential retry on the same model) — only fallback to the *next* tier.

## Decisions

**Model fallback chain order: `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash`.**
This matches the model-name mapping already hardcoded in `OcrService.geminiModelName()` (lines ~495-501) and mirrors the cost/capability ordering: start cheap, escalate on failure, end on the previously-hardcoded default (`gemini-2.5-flash`) as the most conservative final attempt. Alternative considered: making the chain configurable via `app_settings` — rejected as unnecessary complexity (YAGNI) since there's no current requirement for per-deployment tuning; the chain is a backend implementation detail, not a setting a `mod` user needs to control today.

**Stop at first success, not first non-error.**
A tier is considered successful if it returns a parseable, non-empty result (matches today's "Gemini fails or returns empty" condition that used to trigger the EasyOCR fallback). This preserves existing failure-detection logic rather than introducing a new definition of "success."

**`OCRConfig.provider` default becomes `"gemini-3.1-flash-lite"`.**
Today the field defaults to `"easyocr"` but in practice Gemini was already the de facto default in `geminiModelName()`'s catch-all. Removing EasyOCR means the default must point at a real first-tier model.

**Full DB column drop, not a soft-deprecation.**
Per explicit product decision, historical EasyOCR comparison data has no ongoing value once EasyOCR is gone, so `V25__drop_easyocr_columns.sql` drops the 5 columns outright rather than leaving them nullable/unused. This is simpler than maintaining dead schema and matches the "no compatibility shims" principle.

**Comparison/accuracy tracking is fully removed, not generalized.**
Considered: keeping a generic "multi-provider comparison" framework so a future provider could be compared against Gemini. Rejected — no second provider exists today, and building that abstraction now would be speculative (YAGNI). If a future provider is added, comparison tracking can be redesigned then with real requirements in hand.

## Risks / Trade-offs

- **[Risk]** All 4 Gemini tiers could fail simultaneously (e.g. API outage, revoked key) → **Mitigation**: existing behavior already handles total OCR failure by surfacing `geminiError` and letting the user fill the expense form manually; no new failure mode is introduced, just a longer chain before reaching it.
- **[Risk]** Dropping `easyocr_*` columns is irreversible — any future desire to compare against historical EasyOCR data is lost → **Mitigation**: explicitly accepted by product decision; data was already known to be far less accurate and had no operational use beyond the now-removed dashboard.
- **[Risk]** Higher-tier models (`gemini-3.5-flash`, `gemini-3-flash-preview`) may cost more per call than the previous local EasyOCR fallback (which was free/local) → **Mitigation**: fallback only triggers on failure of cheaper tiers, so the cost increase is bounded to the failure-rate of `gemini-3.1-flash-lite`, which the admin dashboard shows succeeding ~100% of the time today.
- **[Risk]** Removing the `ocr-sidecar` container changes `docker-compose.yml` topology — any external tooling/monitoring referencing the sidecar by name breaks → **Mitigation**: sidecar is internal-only (not exposed beyond the Docker bridge network per its own spec), so no external consumers are expected.

## Migration Plan

1. Implement backend fallback chain + remove EasyOCR code paths (`OcrService.kt`, `OcrController.kt`, `AsyncOcrService.kt`, `Repositories.kt`).
2. Add and run Flyway migration `V25__drop_easyocr_columns.sql`; remove the 5 fields from `OcrComparison` (`Models.kt`).
3. Update frontend (`page.tsx`, `api.ts`) to drop EasyOCR UI and types.
4. Delete `ocr-sidecar/` directory and its `docker-compose.yml` service/volume/depends_on entries.
5. Update tests (`OcrServiceTest.kt`) and docs (CLAUDE.md, README.md, AGENTS.md, GEMINI.md, HANDOFF.md).
6. `make build` + `make test` + `make test-health` before merge, per project workflow.

**Rollback**: revert the branch/PR. The Flyway migration is a column drop with no forward-compatible down-migration written (consistent with "never edit an applied migration" — if rollback is needed before merge, simply don't apply V25; if already applied in a deployed environment, restoring requires a database backup since the dropped data isn't recoverable otherwise).

## Open Questions

None outstanding — all scope, data-loss, and behavior decisions were confirmed with the user during brainstorming.
