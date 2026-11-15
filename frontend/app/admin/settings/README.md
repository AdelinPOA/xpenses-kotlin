# Admin Settings Route (`frontend/app/admin/settings`)

## Overview
Next.js App Router dynamic server-prefetched route (`/admin/settings`) for configuring mileage reimbursement rates, daily allowances, FX margins, FX provider priority/resolution, and mobile quick-add UI toggles.

## Interface
- `[page.tsx:dynamic]` — Route segment config exported as `"force-dynamic"`.
- `[page.tsx:SettingsPage]` — Default-exported async Server Component prefetching settings queries into a dehydrated `QueryClient` for `SettingsClient`.
- `[SettingsClient.tsx:SettingsClient]` — Default-exported client component rendering financial and UI settings inside `AppShell`.
- `[SettingsClient.tsx:MobileUiSettingsCard]` — Internal client component managing the mobile quick-add FAB toggle.

## Invariants
- Role guard: `SettingsClient` checks `isChefFinance` (`user?.role === "chef_finance"`) and `isMod` (`user?.role === "mod"`); renders `access_denied` if neither is true, restricts financial queries (`enabled: isChefFinance`) to `chef_finance`, and renders only `<MobileUiSettingsCard />` when `isMod` is `true` `[SettingsClient.tsx:SettingsClient]`.
- Mileage rate validation: `handleSaveRates` rejects `NaN` values, `mileage_rate_before_tax <= 0`, `fuel_consumption_l_per_100km <= 0`, or negative values for `fuel_price_ron_per_liter`, `pension_rate`, `health_rate`, `income_tax_rate`, or `tax_deduction_eur`, and divides percentage fields by `100` `[SettingsClient.tsx:handleSaveRates]`.
- Daily allowance validation: `handleSaveAllowance` rejects `NaN` or values `< 0` `[SettingsClient.tsx:handleSaveAllowance]`.
- FX margin validation: `handleSaveFxMargins` uppercases trimmed currency keys, rejects duplicate keys, rejects non-finite values or values outside `[0, 100]` for currency margins and `defaultMargin`, and rejects any `"RON"` margin `!== 0` `[SettingsClient.tsx:handleSaveFxMargins]`.
- FX provider ordering & test guards: `moveProvider` enforces bounds `[0, providers.length - 1]` (defaulting initial state to `["BNR", "ECB_FRANKFURTER", "CURRENCY_API"]`); `handleTestResolution` requires non-empty `testCurrency.trim()` and enforces `maxLength={5}` uppercased input `[SettingsClient.tsx:moveProvider, SettingsClient.tsx:handleTestResolution]`.

## Side Effects
- Server prefetch: `SettingsPage` executes parallel `serverFetch` `GET` requests to `/settings/mileage-rates`, `/settings/daily-allowance-rate`, `/settings/fx-providers`, and `/settings/ui` (swallowing individual errors to `null` and logging outer errors via `console.error`) `[page.tsx:SettingsPage]`.
- Client queries: `GET /settings/ui` (`MobileUiSettingsCard`), and when `isChefFinance` is `true`, `GET /settings/mileage-rates`, `GET /settings/daily-allowance-rate`, `GET /settings/fx-margins`, and `getFxProviders()` `[SettingsClient.tsx:MobileUiSettingsCard, SettingsClient.tsx:SettingsClient]`.
- Mutations: optimistic `PATCH /settings/ui` (with cancel/rollback/invalidate on `settingsKeys.mobileUi()`), `PATCH /settings/mileage-rates` (`updateRates`), `PATCH /settings/daily-allowance-rate` (`updateAllowance`), `PATCH /settings/fx-margins` (`updateFxMargins`), `updateFxProviders` (`updateFxProvidersMutation`, scheduling a `4000ms` `setTimeout`), and `testFxProvider` (`handleTestResolution`) `[SettingsClient.tsx:MobileUiSettingsCard, SettingsClient.tsx:updateRates, SettingsClient.tsx:updateAllowance, SettingsClient.tsx:updateFxMargins, SettingsClient.tsx:updateFxProvidersMutation, SettingsClient.tsx:handleTestResolution]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
