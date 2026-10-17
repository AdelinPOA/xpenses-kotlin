# Delegation-email recognition tuning

Moderators can open **Admin → IMAP → Email recognition tuning** (`/admin/imap`). These controls affect delegation emails only, not receipt OCR.

1. Edit **Extraction instructions**, **Examples and expected results**, and **Output formatting instructions**. Use redacted examples and avoid credentials or unnecessary personal data.
2. Select and order active, tested models in **Email model chain**. The first model is primary; later models are fallbacks. Add or test models through the linked AI provider/model catalog.
3. Paste a sample email (plain text or HTML) and choose **Preview email**. Preview uses unsaved guidance and the draft model chain. It neither saves settings nor creates a report or acknowledges a mailbox message. AI previews send the sample and guidance to the configured AI provider.
4. Save the instructions and email model chain separately when satisfied. Changes apply to subsequent ingestion calls; existing reports are not rewritten.

## Result contract

The application retains ownership of the JSON result schema, required dates and English output. Editable guidance cannot change the schema. `Auftrag` and `Kundenauftrag` map to the existing `kundenauftrag` field, preserving leading zeros. **Order nr** is the first delegation detail in the GUI and PDF, and the first description line when an order number is available.

Titles, descriptions and descriptive task/operation/workplace values are requested in English. Proper names, postal addresses, order numbers and technical identifiers are retained. HTML tables are normalized locally, retaining row boundaries and address continuation lines without fetching remote resources.

## Preview versus local fallback

AI preview reports failure explicitly if AI is disabled, no model is selected, or every model returns an invalid result. It does not silently substitute local output.

Local preview uses deterministic extraction and displays a warning: it cannot translate source text or apply AI guidance/examples/formatting. Live ingestion retains its existing local fallback when AI cannot produce a valid result. Use a working AI model chain for English translations.

The older **Simulate ingestion — creates a draft report** tool is separate and still writes a real draft. Do not use it for side-effect-free tuning.

## Storage and access

Guidance is stored as the `delegation_parsing_config` application setting. The existing `ocr_config.delegation_model_chain` stores the email model chain; the GUI patches only that chain, leaving receipt settings unchanged. No database migration is needed.

`GET/PATCH /api/settings/imap/parsing` and `POST /api/settings/imap/preview` require the Moderator (`mod`) role. Preview accepts at most 50,000 source characters; guidance limits are 12,000 characters for instructions, 20,000 for examples, and 6,000 for formatting.
