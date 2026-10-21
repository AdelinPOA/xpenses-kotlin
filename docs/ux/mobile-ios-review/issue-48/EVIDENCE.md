# Bulk review verification evidence (#48)

Captured from synthetic fixtures through Playwright; all API requests used by the browser are intercepted. No production expense or receipt data was read or written.

## Visual matrix

The current review drawer was captured in EN/RO and light/dark at both required mobile widths, plus a 1280×800 desktop regression viewport. Mobile screenshots use Playwright's iPhone 13 WebKit emulation (CSS viewport dimensions are in filenames; screenshots are device-scale-factor 3). Desktop screenshots use Desktop Chrome.

| Locale | Theme | 375×667 | 390×844 | 1280×800 |
| --- | --- | --- | --- | --- |
| EN | Light | [capture](after/bulk-en-light-375x667.png) | [capture](after/bulk-en-light-390x844.png) | [capture](after/bulk-en-light-1280x800.png) |
| EN | Dark | [capture](after/bulk-en-dark-375x667.png) | [capture](after/bulk-en-dark-390x844.png) | [capture](after/bulk-en-dark-1280x800.png) |
| RO | Light | [capture](after/bulk-ro-light-375x667.png) | [capture](after/bulk-ro-light-390x844.png) | [capture](after/bulk-ro-light-1280x800.png) |
| RO | Dark | [capture](after/bulk-ro-dark-375x667.png) | [capture](after/bulk-ro-dark-390x844.png) | [capture](after/bulk-ro-dark-1280x800.png) |

Synthetic row: `OMV Petrom`, amount `1234.56 EUR`, date `2026-07-13`, and a generated receipt thumbnail. At both mobile widths, the test asserts the amount control is at least 96 CSS px, currency at least 80 CSS px, the values/date are present, and the drawer has no horizontal overflow. The desktop capture retains the full-width editing layout.

## Verification

- `frontend/tests/expenses/bulk-review.spec.ts`: 19 passed, 1 skipped across mobile Chromium and mobile WebKit, one worker. Covers ambiguous upload HTTP 500 without false success/automatic replay, mixed receipt failure/retry with known Expense ID, PATCH 400 and 500 recovery, delete failure, attempted-value retention, close guard, response-loss uncertainty, clear acknowledgements, serialized edits, and 375/390px control sizing. The screenshot matrix also ran successfully on mobile WebKit and desktop Chrome; the mobile Chromium screenshot-only variant is intentionally skipped.
- `node --test tests/expenses/bulk-review-state.test.cjs tests/expenses/bulk-upload-size.test.cjs`: 16 passed. Covers explicit unsupported/HEIC, per-file/aggregate size, count, and batch-budget rejection behavior, plus handler/state recovery.
- `npm run typecheck`: passed.
- `npm run i18n:check`: passed; all 1,111 keys exist in both locales.
- Browser tests used single worker and mocked requests. Next's server-side prefetch logged expected `ENOTFOUND backend` because this isolated test environment has no `backend` hostname; intercepted browser assertions passed.

## Limits and status

These are emulator/browser captures, not physical-iPhone validation. Safari dynamic bars, real keyboard/safe areas, camera/HEIC behavior, VoiceOver, and standalone PWA remain under the human-device gate #51. The generated receipt is an SVG fixture, not a real receipt. Shared modal focus/lifecycle behavior remains for #50. No bulk application implementation was changed in this verification follow-up; the existing P2 implementation remains the deployed behavior. Issue #48 stays open until these local test/evidence changes are integrated and the remaining device gate is handled.
