## Context

The IMAP email import system (`EmailImportService.kt`) receives delegation emails from German industrial companies. These emails follow a structured table format with labelled fields (Kundenauftrag, Positionstyp, TechnPlatz, etc.). The current parser extracts only 4 fields (title, date_from, date_to, description) and discards the rich structure by concatenating everything into description text.

The image from the user shows a real email from a supplier with 10+ structured fields in a clean tabular layout. This is a common format in the German automotive/industrial sector.

Stack: Kotlin 2.1.0, Spring Boot 3.4.3, OpenPDF/PdfBox, Gemini 2.5 Flash API, React 19 + TanStack Query.

## Goals / Non-Goals

**Goals:**
- Local parser extracts 12+ structured fields as first-class map entries
- Gemini parser schema & prompt updated to return the same extended fields
- ExpenseReport stores delegation fields as nullable columns (Flyway migration V4)
- Frontend simulation page displays structured fields in a table/card layout
- TechnPlatz `Cxxxxxx` values are detected as production line IDs with a visual badge

**Non-Goals:**
- No changes to the expense CRUD or report state machine
- No changes to existing report flows that don't use email import
- No SFTP/SMB/WebDAV changes (already done in previous session)
- No automated migration of existing reports (new fields are null for old reports)

## Decisions

### Decision 1: Separate nullable columns vs. JSON metadata column

**Choice**: Option A — separate nullable columns on `ExpenseReport` via Flyway V4 migration.

**Rationale**: 11 distinct fields (10 text + 1 boolean). Separate columns enable SQL querying (filter reports by customer, find all reports for a production line), indexing, and simpler serialization with Jackson's snake_case config. JSON metadata would require parsing logic for every read.

**Alternative considered**: Single JSON `email_metadata` TEXT column. Rejected because it prevents SQL filtering and adds serialization complexity.

### Decision 2: Local parser uses keyword-matching (not ML)

**Choice**: Keep the existing regex/keyword-matching approach for the local parser, extended with new keyword groups for each new field.

**Rationale**: The email format is consistent (labelled fields with whitespace-separated values). A regex parser is deterministic, explainable, and doesn't need API calls or model downloads. The Gemini parser handles edge cases and format variations.

### Decision 3: Gemini schema uses structured output, not free-text

**Choice**: Extend the existing `responseSchema` JSON schema from 4 properties to 15 properties, keeping `responseMimeType: application/json`.

**Rationale**: Gemini's structured output gives strongly-typed, predictable JSON responses. Free-text prompting for JSON in the system prompt is less reliable.

### Decision 4: technplatz_line detection is rule-based

**Choice**: If `technplatz_raw` starts with a capital `C` followed by 6+ digits, set `technplatz_line = true`. This rule applies to both local and Gemini parsers.

**Rationale**: The `Cxxxxxx` pattern is a consistent identifier for production lines in the German industrial context. A simple regex check (`^C\d{6,}`) is sufficient.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| New fields bloat the ExpenseReport entity | All fields are nullable; Hibernate only loads them on read; no impact on query performance for non-delegation reports |
| Gemini response schema change could break existing calls | Old responses (4 fields only) are still valid; backend fills missing fields with null/defaults |
| Frontend displays messy UI if all fields are empty | Only render rows for non-null fields; empty state handled gracefully |
| Flyway migration runs on existing production DB | V4 migration uses `ALTER TABLE ADD COLUMN IF NOT EXISTS` pattern; nullable columns with defaults |
