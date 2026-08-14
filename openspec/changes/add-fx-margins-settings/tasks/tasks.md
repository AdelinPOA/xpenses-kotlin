## Task 1: Backend — FX margins endpoints

- [ ] Add `GET /api/settings/fx-margins` and `PATCH /api/settings/fx-margins` to `AppSettingsController`
  - GET: read `fx_margins` app setting; if absent return built-in defaults (EUR 0.02, USD 0.025, GBP 0.02, CHF 0.02, default 0.02) as percent values
  - PATCH: `@PreAuthorize("hasRole('chef_finance')")`, validate 0–100 percent from JSON map, merge into existing map, save fraction values (value/100)
  - Return shape: `{ margins: { "EUR": 2.0, "USD": 2.5, ... }, default_margin: 2.0, currencies: ["EUR","USD","GBP","CHF","RON"] }`
- [ ] Add unit tests for GET defaults, PATCH merge, and PATCH role guard (403)

## Task 2: Frontend — settings page section

- [ ] Add `fxMargins: () => ["settings", "fx-margins"]` to `settingsKeys` and a `FxMargins` type to `lib/api`
- [ ] Add "FX Margins" card in `SettingsClient.tsx`: editable percent input per currency, save button, success/error feedback
  - Values are sent as percent; backend converts to fraction
- [ ] Add i18n keys (`fx_margins`, `fx_margins_description`, `fx_margin_currency_note`, etc.) to `en.json` and `ro.json` (keep parity)

## Task 3: Verify

- [ ] Run backend tests (`./gradlew test`)
- [ ] Run frontend i18n parity script (`node scripts/check-i18n-parity.mjs`)
- [ ] Type-check frontend build