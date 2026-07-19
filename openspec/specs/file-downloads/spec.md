# file-downloads Specification

## Purpose
TBD - created by archiving change fix-mobile-ios-review. Update Purpose after archive.
## Requirements
### Requirement: Blob downloads work on iOS and PWA
The shared `downloadBlob` helper SHALL defer `URL.revokeObjectURL` (timeout, not immediately after click) and, on iOS devices or in standalone PWA mode, SHALL open the blob in a new tab via `window.open` instead of relying on the `download` attribute, which is ignored in WKWebView contexts.

#### Scenario: Receipt view on iPhone PWA
- **WHEN** a user taps "View" on a receipt in the installed PWA on iOS
- **THEN** the receipt opens (new tab/viewer) instead of silently doing nothing

#### Scenario: Desktop downloads unchanged
- **WHEN** a user exports a report PDF on desktop Chrome/Safari
- **THEN** the file downloads with the intended filename as before

#### Scenario: No premature revocation
- **WHEN** any download is triggered on iOS Safari
- **THEN** the blob URL remains valid until the navigation has started

### Requirement: Download entry points use the shared helper
All authenticated file downloads (receipts, report PDF, receipts ZIP, CSV/XLSX exports) SHALL route through the shared helper rather than ad-hoc anchor clicks.

#### Scenario: Export expenses CSV on iOS
- **WHEN** a user chooses "Download CSV" from the export menu on an iPhone
- **THEN** the CSV opens/downloads successfully

