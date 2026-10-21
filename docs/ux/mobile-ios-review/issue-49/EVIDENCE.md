# Issue #49 — capture/review/list evidence

## Comparable matrix

Baseline: clean merged prerequisites `c3b9b68`, before PR #64. After: repaired PR #64 worktree. The deterministic fixture is Expense 31 / Receipt 32, amount 12.34 EUR, merchant `OCR Market`, date 2026-10-20. Every browser API is intercepted for these screenshots; no production data is displayed or modified.

Each of `before/` and `after/` contains 24 full-page PNGs: capture, review/edit and list × EN/RO × light/dark × 375×667 and 390×844. WebKit iPhone emulation uses device-scale-factor 3. Language is set in both the cookie and mocked owner profile; theme uses the actual stored preference. No product UI is hidden for captures. Only the Next development-tools overlay is removed. The first-visit iOS installation hint may appear and is not evidence of standalone-PWA testing.

Before had no immediate confirmation screen: its `review-*` frame shows the ordinary Expense form, and its list has no post-confirmation announcement/highlight. After retains the source, opens the explicit review screen and shows the confirmed Expense highlighted in the list. The action group is in normal flow rather than covering inputs with a four-button sticky surface. There is no horizontal page overflow in the matrix assertions. The longer review document and small-screen scrolling remain visible in full-page captures rather than cropped away.

Representative comparison:

- [Before capture, RO dark 375](before/capture-ro-dark-375x667.png) → [After](after/capture-ro-dark-375x667.png)
- [Before edit, RO dark 375](before/review-ro-dark-375x667.png) → [After immediate review](after/review-ro-dark-375x667.png)
- [Before list, RO light 390](before/list-ro-light-390x844.png) → [After confirmed highlight](after/list-ro-light-390x844.png)

## Behavior, not screenshots alone

`frontend/tests/expenses/capture-review.spec.ts` covers replay, reload, failures, historical compatibility, concurrency and known-ID preservation. Its opt-in `visual capture flow` cases generate this matrix. Separate real authenticated integration allows the service worker and actually closes the page before offline navigation, then verifies that online resume restores local corrections and confirmation uses the real API. Mocked screenshots do not substitute for that integration check.

Physical Safari/PWA, camera/library/PDF hardware behavior, VoiceOver and keyboard/safe areas still require #51. No physical-device pass is claimed.
