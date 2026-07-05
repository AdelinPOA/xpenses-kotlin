## Why

The left column in the PDF report header (which contains the Report Title, Description, Delegation Details, and Submitter information) is currently too narrow (50% width), causing long delegation detail lines to wrap and appear squished. The right column (containing only the Report Duration) has too much empty space.

## What Changes

- Change the PDF report header metadata table column widths from 50/50 to 70/30 (`floatArrayOf(70f, 30f)`).
- This gives the left column more space (70% width) to prevent long text lines from wrapping, while the right column (30% width) has enough space to display the delegation period.

## Capabilities

### New Capabilities

### Modified Capabilities
- `pdf-export`: Header layout column widths.

## Impact

- **Backend**: Update the column widths of the metadata table in `PdfService.kt`.
