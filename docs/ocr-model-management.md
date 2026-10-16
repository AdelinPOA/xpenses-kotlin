# Managing AI providers and model chains

Moderators configure receipt OCR and delegation-email parsing at **Admin → OCR** (`/admin/ocr`). “Admin” and “Moderator” are the same `mod` role, not separate permissions. Other roles cannot read, change, or test these settings.

The shared catalog replaces the hardcoded Gemini model selector and runtime fallback list. Compatible providers and model IDs can now be added without changing code or redeploying. See [ADR-0006](adr/0006-gui-managed-ai-provider-model-chains.md) for the integration boundary and [CONTEXT.md](../CONTEXT.md) for terminology.

## Add a provider and model

1. In **Providers**, enter a display name, API base URL, and API key, then choose **Add provider** and **Save changes**.
   - The provider must implement OpenAI-compatible **Chat Completions**, including multimodal image input and JSON-object responses.
   - Use the provider's API base URL, such as `https://api.example.com/v1`. The app appends `/chat/completions`; a URL already ending with that path also works.
   - HTTPS and public network addresses are required. Localhost, private networks, cloud metadata endpoints, and unsafe DNS answers are blocked, including at connection time. Self-hosted providers need an accessible public HTTPS endpoint.
   - The API key may be omitted for an endpoint that does not require authentication.
2. In **Models**, choose the provider and enter its exact API model ID plus a display name. Choose **Add model** and **Save changes**. A new model starts inactive and untested.
3. Choose **Test model**. This sends a synthetic receipt image through the actual model request and result parsing. It can incur a provider charge. The test requires the expected amount, currency, merchant, and date—not merely successful authentication.
4. After a successful test, enable **Active** and save. The backend independently enforces successful testing before activation; the client cannot set the tested flag.
5. Add the model to the desired workflow chain, arrange its position, and save again. Activation alone does not add it to either chain.

Saved API keys are encrypted at rest and never returned to the browser. A blank key input keeps the stored value; enter a replacement to rotate it. The GUI does not support clearing a saved key by submitting an empty string.

## Primary model and fallback order

There are two independent ordered chains:

- **Receipt OCR fallback chain** — extracts receipt fields.
- **Delegation email fallback chain** — extracts delegation fields. If every configured AI attempt fails, the existing local email parser is tried.

The first eligible model is primary. Use the up/down controls to change priority; removing a model from one chain does not remove it from the catalog or the other chain. Only active, tested models are executed.

Any model-call failure, malformed response, or unusable result advances to the next model. Receipt results require a finite numeric amount and a three-letter currency value. Delegation results require a nonblank title, a string description, valid calendar dates, and a non-reversed date range. The first usable result stops fallback; the app does not compare multiple successful answers.

The **Enable OCR** toggle currently controls AI calls for both workflows. When disabled, receipt OCR is disabled and delegation emails use the local parser. With an empty eligible receipt chain, scanning reports that no active, tested models are configured.

Changes apply to subsequent processing calls. A running provider/fallback execution retains the configuration it read when it started; durable job retries may read newer settings. Save/test operations lock form editing, and background refreshes preserve unsaved drafts. Full-catalog saves from different browser sessions remain last-writer-wins for explicitly submitted fields; avoid concurrent administrative edits.

## Edit, rotate credentials, deactivate, and retest

- Changing a provider's endpoint or credentials invalidates its models' tests and deactivates them. The GUI also removes affected models from both chains; test, activate, and add them back when ready.
- Changing a model's provider or external API model ID similarly requires retesting. Changing only its display name does not.
- To retest an active model, deactivate it and save first. A failed retest revokes its previous successful-test status. Successful testing does not reactivate it automatically.
- A model test merges only its test result into the latest settings. If the model, endpoint, or credentials changed during the request, that result is discarded and the model must be tested again.
- Deactivate obsolete models rather than deleting their records. Existing catalog identities are retained for historical references; saved providers cannot be deleted through a replacement catalog either.

The application owns prompts, extraction fields, JSON handling, and validation. Request templates and arbitrary provider-specific response mappings are not editable in the GUI.

## Compatibility and operational limits

- “Compatible” does not mean every provider or every model. Proprietary API formats require a backend adapter. Models must pass the synthetic multimodal receipt test, even if intended for the email chain; text-only models cannot bypass it.
- PDF inputs are rendered to images; only the **first five pages** are processed. Review longer documents manually rather than assuming all pages were extracted.
- A long fallback chain increases worst-case latency and potential charges. Connect/pool waits and response waits are bounded per HTTP request, not by a single end-to-end chain deadline.
- Provider errors are sanitized; credentials, raw error response bodies, and raw network exception causes are not exposed to technicians. Failed attempts are logged; the comparison history records the successful provider/model label, bounded to its existing database column width.
- Receipt cache identity includes the ordered eligible providers/endpoints/model IDs. The new contract version does not reuse legacy cache entries; those remain subject to existing retention cleanup.
- No new database migration is required: catalog configuration uses the existing `app_settings` entry `ocr_config`.

## Existing Gemini settings

Legacy settings are converted on read into a Google Gemini provider using `https://generativelanguage.googleapis.com/v1beta/openai` and a model catalog. The saved Gemini key is decrypted once using its legacy context; the next catalog write encrypts it using the provider-specific context. Existing configured models are grandfathered as tested/active when a usable legacy key exists; newly added models must pass testing.

The legacy selected model becomes primary and the remaining seeded Gemini models become receipt fallbacks. Delegation parsing starts with the legacy selected model. Migration and catalog round trips are covered with real cryptography and PostgreSQL-backed API tests.

## Settings API

All endpoints require the `mod` role:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/settings/ocr` | Read `ocr_enabled`, providers with `api_key_set`, models with `active`/`tested`, and both ordered chains. No credentials are returned. |
| `PATCH /api/settings/ocr` | Update supplied settings. Provider entries may include a write-only `api_key`; omitted/blank keys retain the current secret. Model entries cannot set `tested`. Existing catalog identities must remain present. |
| `POST /api/settings/ocr/models/test` | Test a saved inactive model with body `{"model_id":"<catalog-model-id>"}`; returns `success` and `message`, and updates authoritative test state. |

`model_id` in the test request is the catalog entry's `id`, not its provider-specific model identifier. Workflow chains also contain catalog IDs. Provider/model arrays replace the supplied catalog lists rather than appending individual entries.

The former `provider`/`gemini_api_key` settings API shape and `/api/settings/ocr/test` action are replaced by this catalog contract. Existing `gemini_*` comparison fields and email-simulation aliases remain for compatibility; their values can now originate from other compatible providers.

## Focused verification

Run sequentially on a production host; avoid full parallel container/browser suites:

```bash
cd backend-kotlin-jpa
./gradlew --no-daemon \
  -Dorg.gradle.jvmargs='-Xmx768m -XX:MaxMetaspaceSize=384m' \
  -Pkotlin.compiler.execution.strategy=in-process \
  test \
  --tests eu.nt.xpenses.services.OcrServiceTest \
  --tests eu.nt.xpenses.services.EmailImportServiceTest \
  --tests eu.nt.xpenses.services.OpenAiCompatibleClientTest \
  --tests eu.nt.xpenses.controllers.OcrSettingsControllerTest \
  --tests eu.nt.xpenses.controllers.OcrCatalogIntegrationTest

cd ../frontend
npm run typecheck
npm run i18n:check
npx playwright test tests/admin/ocr.spec.ts tests/admin/imap.spec.ts \
  --project=desktop --project=mobile-chromium --workers=1
```

The PostgreSQL lifecycle test uses an isolated, resource-limited database container; it does not connect to production. Provider I/O is mocked in automated lifecycle/browser tests. A moderator's explicit **Test model** action is the live-provider compatibility check.

See the [2026-10-16 verification and deployment record](releases/2026-10-16-ocr-model-management.md).
