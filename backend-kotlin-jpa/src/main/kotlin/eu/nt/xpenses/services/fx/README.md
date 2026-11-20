# FX Rate Providers

## Overview
Multi-provider foreign exchange rate resolution subsystem in `eu.nt.xpenses.services.fx` with configurable provider priority persisted in application settings.

## Interface
- `[FxRateProvider.kt:FxRateSource]` — `enum class` defining FX sources: `BNR`, `ECB_FRANKFURTER`, `CURRENCY_API`
- `[FxRateProvider.kt:ProviderRate]` — `data class ProviderRate(rateToEur: BigDecimal, sourceDate: LocalDate, source: FxRateSource)`
- `[FxRateProvider.kt:ProviderHealthState]` — `data class` storing per-provider live health, RON/EUR rate, latency, and summarized failure detail
- `[FxRateProvider.kt:FxRateProvider]` — `interface` declaring `resolve(currency: String, requestedDate: LocalDate): ProviderRate?`
- `[FxRateProvider.kt:HttpFxRateProvider]` — Spring `@Component` implementing `FxRateProvider` with priority-ordered provider fallback and `probeProvider(...)` / `getProviderStates()`
- `[FxRateProvider.kt:HttpFxRateProvider.getProviderPriority]` — `fun getProviderPriority(): List<FxRateSource>` reading configured order from `AppSetting` or returning defaults
- `[FxRateProvider.kt:HttpFxRateProvider.saveProviderPriority]` — `fun saveProviderPriority(priority: List<FxRateSource>)` persisting normalized provider priority order
- `[FxRateProvider.kt:HttpFxRateProvider.resolve]` — `override fun resolve(currency: String, requestedDate: LocalDate): ProviderRate?`
- `[FxRateProvider.kt:BnrRateProvider]` — `internal object` with `BASE_URL`, `fetch(restClient, currency, requestedDate)`, and `parse(xml, currency, requestedDate)` for National Bank of Romania XML feeds
- `[FxRateProvider.kt:CurrencyApiRateProvider]` — `internal object` with `parse(json, currency, requestedDate)` for currency-api JSON feeds
- `[FxProviderHealthService.kt:FxProviderHealthService]` — Spring `@Service` running periodic `@Scheduled` and on-demand provider probes (`runHealthCheck`) and computing `FxHealthStatusOut` (`HEALTHY`, `FALLBACK`, `DOWN`, `UNKNOWN`) via `getHealthStatus()`

## Invariants
- `[FxRateProvider.kt:HttpFxRateProvider.fetchFrankfurter]` — requires `sourceDate <= requestedDate` and `rate.signum() > 0`
- `[FxRateProvider.kt:BnrRateProvider.parse]` — requires `sourceRate.signum() > 0`, selects the latest `<Cube>` date `<= requestedDate`, and configures the XML parser to disallow `DOCTYPE` declarations and external entities
- `[FxRateProvider.kt:BnrRateProvider.fetch]` — falls back to prior year XML only when `requestedDate.dayOfYear <= 5`; non-2xx responses (including `302`) and non-XML payloads throw explicitly so outages are recorded
- `[FxRateProvider.kt:CurrencyApiRateProvider.parse]` — returns `null` if `rate.signum() <= 0`
- `[FxRateProvider.kt:HttpFxRateProvider.getProviderPriority]` — deduplicates parsed priorities and appends any missing `FxRateSource` entries
- `[FxRateProvider.kt:HttpFxRateProvider.saveProviderPriority]` — deduplicates the supplied priority list and preserves all `FxRateSource` values

## Side Effects
- `[FxRateProvider.kt:HttpFxRateProvider.getProviderPriority]` — DB read via `appSettingRepository.findById("fx_provider_priority")`
- `[FxRateProvider.kt:HttpFxRateProvider.saveProviderPriority]` — DB write via `appSettingRepository.save` for `"fx_provider_priority"`
- `[FxRateProvider.kt:HttpFxRateProvider.fetchFrankfurter]` — HTTP GET to `https://api.frankfurter.dev/v2/rate/{currency}/EUR?date={requestedDate}&providers=ECB`
- `[FxRateProvider.kt:HttpFxRateProvider.fetchCurrencyApi]` — HTTP GET to `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{requestedDate}/v1/currencies/{currency}.min.json` and fallback `https://latest.currency-api.pages.dev/v1/currencies/{currency}.min.json`
- `[FxRateProvider.kt:BnrRateProvider.fetchYear]` — HTTP GET to `https://curs.bnr.ro/files/xml/years/nbrfxrates{year}.xml`
- `[FxProviderHealthService.kt:FxProviderHealthService.scheduledHealthCheck]` — periodic `@Scheduled` probe across all configured providers (controlled by `fx.health.scheduled-enabled`)

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.services.fx.FxRateProviderTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
