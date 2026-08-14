# FX Margins Setting

## ADDED Requirements

### Requirement: Manage FX margins from admin settings

Finance admins can view and edit the per-currency FX margins used for receipt-to-EUR conversion, from the admin settings page. Margins MUST be stored as a JSON map in the `fx_margins` app setting.

#### Scenario: Finance admin views FX margins

- **When** a user with role `chef_finance` opens the admin settings page
- **Then** an "FX Margins" section lists each currency with its configured margin in percent
- **And** currencies without an explicit margin show the default fallback (+2.0%) marked as such

#### Scenario: Finance admin updates an FX margin

- **When** a user with role `chef_finance` edits the margin for a currency and saves
- **Then** the backend stores the new value in the `fx_margins` app setting as a JSON map (currency → fraction, e.g. `{"USD": 0.03}`)
- **And** the change takes effect immediately for new rate lookups (the `fx_rates` cache is not purged; existing cached rates are unchanged)

#### Scenario: Non-finance user cannot change margins

- **When** a user without role `chef_finance` attempts to PATCH the FX margins setting
- **Then** the request is rejected with 403

#### Scenario: Defaults when setting is absent

- **When** the `fx_margins` app setting does not exist
- **Then** the GET endpoint returns the built-in defaults (EUR 0.02, USD 0.025, GBP 0.02, CHF 0.02, default 0.02 for other currencies) without creating the setting

### Requirement: FX margins API contract

`GET /api/settings/fx-margins` and `PATCH /api/settings/fx-margins` SHALL expose the `fx_margins` app setting. The API SHALL work in percent; the stored format SHALL remain currency → fraction for backward compatibility with `FxService`.

#### Scenario: GET returns effective margins

- **When** `GET /api/settings/fx-margins` is called by an authenticated admin
- **Then** the response contains the per-currency margins in percent, the default fallback margin in percent, and the list of supported currencies (EUR, USD, GBP, CHF, RON plus any currencies present in the setting)

#### Scenario: PATCH partially updates margins

- **When** `PATCH /api/settings/fx-margins` is called by a `chef_finance` user with a JSON map of currency → margin in percent (e.g. `{"USD": 3.0}`)
- **Then** only the provided currencies are updated and other margins are preserved

#### Scenario: PATCH validates margin range

- **When** `PATCH /api/settings/fx-margins` is called with a margin outside 0–100 percent
- **Then** the request is rejected with 400
