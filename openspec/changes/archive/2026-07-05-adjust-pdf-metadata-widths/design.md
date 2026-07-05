## Context

The metadata table in the PDF report is currently configured as a 50/50 two-column table. This causes long lines in the left cell (especially Delegation Details) to wrap and look squished, while the right cell (which only displays Report Duration) is mostly empty.

## Goals / Non-Goals

**Goals:**
- Give more horizontal space to the left metadata cell.
- Maintain a readable right metadata cell for the delegation duration.

## Decisions

### Metadata Table Column Widths

In `PdfService.kt`, update `metaTable` to use widths:
`metaTable.setWidths(floatArrayOf(70f, 30f))`

This provides 70% width for the left column (titles, details, submitter) and 30% width for the right column (duration).

## Risks / Trade-offs

None. 30% width is more than enough for "Report Duration" and "2026-06-22 - 2026-07-04" without wrapping.
