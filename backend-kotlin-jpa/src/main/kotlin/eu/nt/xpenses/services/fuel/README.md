# Fuel Price Services

## Overview
Multi-provider Romanian fuel price resolution, caching, and provider health monitoring subsystem in `eu.nt.xpenses.services.fuel`, supporting live/historical external feeds (`PRETCARBURANT_LIVE`, `PRETCARBURANT_DATA`, `EU_WEEKLY_OIL_BULLETIN`) and `MANUAL_SETTING` fallback.

## Interface
- `[FuelPriceProvider.kt:FuelPriceSource]` — `enum class` defining sources: `PRETCARBURANT_LIVE`, `PRETCARBURANT_DATA`, `EU_WEEKLY_OIL_BULLETIN`, `MANUAL_SETTING`
- `[FuelPriceProvider.kt:ProviderFuelPrice]` — `data class ProviderFuelPrice(priceRonPerLiter: BigDecimal, sourceDate: LocalDate, source: FuelPriceSource, stationCount: Int? = null)`
- `[FuelPriceProvider.kt:FuelProviderHealthState]` — `data class` storing per-provider health, `sourceDate`, `dieselRon`, `petrolRon`, `lpgRon`, `latencyMs`, and `error`
- `[FuelPriceProvider.kt:FuelPriceProvider]` — `interface` declaring `resolve(canonicalFuelType: String, requestedDate: LocalDate): ProviderFuelPrice?`
- `[FuelPriceProvider.kt:HttpFuelPriceProvider]` — `@Component` implementing `FuelPriceProvider` with `getProviderPriority()`, `saveProviderPriority(...)`, `resolvePriorityForDate(...)`, `getProviderStates()`, `probeProvider(...)`, and `resolve(...)`
- `[FuelPriceService.kt:ResolvedFuelPrice]` — `data class ResolvedFuelPrice(priceRonPerLiter: BigDecimal, sourceDate: LocalDate, source: FuelPriceSource, fuelType: String)`
- `[FuelPriceService.kt:FuelPriceService]` — `@Service` exposing `resolveFuelPrice(vehicleFuelType: String?, date: LocalDate): ResolvedFuelPrice`
- `[FuelPriceHealthService.kt:FuelPriceHealthService]` — `@Service` running `@Scheduled` (`scheduledHealthCheck()`) and on-demand (`runHealthCheck(...)`) provider probes and reporting `getHealthStatus(): FuelPriceHealthStatusOut`

## Invariants
- `[FuelPriceProvider.kt:PretCarburantLiveParser.parse]` — rejects `sourceDate` after `requestedDate` or older than 14 days (`MAX_STALE_DAYS`), throws `IllegalStateException` on empty/malformed JSON, and averages positive prices per canonical type (`diesel`, `petrol`, `lpg`) rounded to 2 decimals `HALF_UP`
- `[FuelPriceProvider.kt:PretCarburantDataParser.parse]` — ignores entries after `requestedDate`, older than 14 days, or `<= 0`, selecting the latest `rowDate` per canonical type rounded to 2 decimals `HALF_UP`
- `[FuelPriceProvider.kt:EuWeeklyOilBulletinParser.parse]` — requires valid sheet, bulletin date, Romania row, and `ronToEur > 0`; returns empty when `bulletinDate` is after `requestedDate` or older than 21 days
- `[FuelPriceProvider.kt:HttpFuelPriceProvider.getProviderPriority]` / `[FuelPriceProvider.kt:HttpFuelPriceProvider.saveProviderPriority]` — restricts priorities to `EXTERNAL_SOURCES`, deduplicates, appends missing external sources, and falls back to `EXTERNAL_SOURCES` on missing/corrupt settings
- `[FuelPriceProvider.kt:HttpFuelPriceProvider.resolvePriorityForDate]` — swaps `PRETCARBURANT_LIVE` and `PRETCARBURANT_DATA` for historical dates (`requestedDate < today` in `Europe/Bucharest`)
- `[FuelPriceService.kt:FuelPriceService.resolveFuelPrice]` — uses `MANUAL_SETTING` without DB caching for null/blank (`"default"`), `"electric"`, or unknown fuel types; maps `"hybrid"` to `"petrol"`; returns `fuel_prices` DB cache hits without calling external providers; falls back to `MANUAL_SETTING` when external resolution returns `null`
- `[FuelPriceService.kt:FuelPriceService.persistCachedPrice]` — persists new `FuelPrice` rows in `PROPAGATION_REQUIRES_NEW` when `transactionManager` is present so duplicate `DataIntegrityViolationException` does not roll back the caller transaction
- `[FuelPriceHealthService.kt:FuelPriceHealthService.getHealthStatus]` — reports `"UNKNOWN"`, `"HEALTHY"`, or `"FALLBACK"` (with `activeSource = "MANUAL_SETTING"` when all checked providers are unhealthy)

## Side Effects
- `[FuelPriceProvider.kt:HttpFuelPriceProvider.getProviderPriority]` / `[FuelPriceProvider.kt:HttpFuelPriceProvider.saveProviderPriority]` — reads and writes `"fuel_provider_priority"` in `app_settings` via `AppSettingRepository`
- `[FuelPriceProvider.kt:HttpFuelPriceProvider.fetchAndParse]` — executes outbound HTTP GET requests to `pretcarburant.ro`, `raw.githubusercontent.com`, and `energy.ec.europa.eu`, updates in-memory TTL caches, and calls `FxService.getRate("RON", ...)`
- `[FuelPriceProvider.kt:HttpFuelPriceProvider.probeProvider]` / `[FuelPriceProvider.kt:HttpFuelPriceProvider.resolve]` — mutates in-memory `providerStates` `ConcurrentHashMap` and logs warnings
- `[FuelPriceService.kt:FuelPriceService.resolveFuelPrice]` / `[FuelPriceService.kt:FuelPriceService.persistCachedPrice]` — queries and inserts `FuelPrice` rows via `FuelPriceRepository`, reads manual prices via `AppSettingsService.getManualFuelPrice`, and logs an SLF4J `WARN` on `provider_miss` fallback
- `[FuelPriceHealthService.kt:FuelPriceHealthService.scheduledHealthCheck]` / `[FuelPriceHealthService.kt:FuelPriceHealthService.runHealthCheck]` / `[FuelPriceHealthService.kt:FuelPriceHealthService.getHealthStatus]` — executes `@Scheduled` / on-demand probes and queries `FuelPriceRepository.findTopByOrderByFetchedAtDesc()`

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --no-daemon`
