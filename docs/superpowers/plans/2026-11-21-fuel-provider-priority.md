# Fuel Provider Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `mod` and `chef_finance` users to view and manually reorder the priority of the 3 external fuel price sources (`PRETCARBURANT_LIVE`, `PRETCARBURANT_DATA`, `EU_WEEKLY_OIL_BULLETIN`) in `/admin/settings`.

**Architecture:** Mirror the existing `fx-providers` priority pattern: store a JSON array of external `FuelPriceSource` names under `app_settings` key `fuel_provider_priority` via `HttpFuelPriceProvider`, expose `GET`/`PATCH /api/settings/fuel-providers` in `AppSettingsController` guarded by `@PreAuthorize("hasAnyRole('mod', 'chef_finance')")`, and add Up/Down reorder + Save controls to `FuelPriceHealthCard` in `SettingsClient.tsx`. For past dates (`requestedDate < today`), `HttpFuelPriceProvider.resolve()` keeps `PRETCARBURANT_DATA` ahead of `PRETCARBURANT_LIVE` while preserving the configured relative position of `EU_WEEKLY_OIL_BULLETIN`.

**Tech Stack:** Kotlin, Spring Boot, Spring Security (`@PreAuthorize`), JPA (`AppSettingRepository`), JUnit 5 / MockK / Spring MockMvc, Next.js (TypeScript), React Query, `next-intl`.

**Spec:** `docs/superpowers/specs/2026-11-21-fuel-provider-priority-design.md`

## Global Constraints

- Only the 3 external sources (`PRETCARBURANT_LIVE`, `PRETCARBURANT_DATA`, `EU_WEEKLY_OIL_BULLETIN`) are configurable; `MANUAL_SETTING` remains the final fallback and is never included in the priority list.
- Endpoints `GET /api/settings/fuel-providers` and `PATCH /api/settings/fuel-providers` must enforce `@PreAuthorize("hasAnyRole('mod', 'chef_finance')")`.
- For `requestedDate.isBefore(today)`, `PRETCARBURANT_DATA` must always be tried before `PRETCARBURANT_LIVE`.
- No new Flyway migrations; use existing `app_settings` table (`AppSettingRepository`).
- Run Gradle with `--no-daemon` and targeted `--tests` flags (`AGENTS.md` production host guardrail).
- Run `cd frontend && npm run typecheck && npm run i18n:check && npm run lint` before finishing frontend changes.

## Review Focus

- **Unauthorized role access:** A `technician` or `admin` (if not `mod`/`chef_finance`) calling `GET`/`PATCH /api/settings/fuel-providers` must receive `403 Forbidden`.
- **Invalid or `MANUAL_SETTING` payload in PATCH:** Sending `["MANUAL_SETTING"]` or `["UNKNOWN"]` or `[]` must return `400 Bad Request` without overwriting `app_settings`.
- **Partial provider list in PATCH:** Sending only 1 or 2 valid external providers (e.g. `["EU_WEEKLY_OIL_BULLETIN"]`) must deduplicate and append the missing external sources in default order so all 3 are always preserved.
- **Corrupt JSON in `app_settings`:** If `fuel_provider_priority` contains malformed JSON or unknown names, `getProviderPriority()` must fall back cleanly to `EXTERNAL_SOURCES` without throwing.
- **Historical date relative ordering:** If configured order is `[EU_WEEKLY_OIL_BULLETIN, PRETCARBURANT_LIVE, PRETCARBURANT_DATA]`, resolving a past date must yield `[EU_WEEKLY_OIL_BULLETIN, PRETCARBURANT_DATA, PRETCARBURANT_LIVE]` (keeping `EU_WEEKLY_OIL_BULLETIN` first, while swapping `PRETCARBURANT_DATA` ahead of `PRETCARBURANT_LIVE`).

---

### Task 1: Backend Priority Persistence & Historical Ordering

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/FuelPriceProvider.kt:273-358`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/FuelPriceHealthService.kt:41-80`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fuel/FuelPriceServiceTest.kt`

**Interfaces:**
- Consumes: `AppSettingRepository` (`findById(String)`, `save(AppSetting)`)
- Produces:
  - `HttpFuelPriceProvider.getProviderPriority(): List<FuelPriceSource>`
  - `HttpFuelPriceProvider.saveProviderPriority(priority: List<FuelPriceSource>)`
  - `HttpFuelPriceProvider.resolvePriorityForDate(requestedDate: LocalDate, today: LocalDate): List<FuelPriceSource>` (internal/public helper)

- [ ] **Step 1: Write failing unit tests in `FuelPriceServiceTest.kt`**

Add tests covering:
- `getProviderPriority()` returns default `EXTERNAL_SOURCES` when `appSettingRepository` is empty or has corrupt JSON.
- `saveProviderPriority(listOf(FuelPriceSource.EU_WEEKLY_OIL_BULLETIN))` persists deduplicated list + missing external sources (excluding `MANUAL_SETTING`) under key `"fuel_provider_priority"`.
- `resolvePriorityForDate(today.minusDays(1), today)` keeps `EU_WEEKLY_OIL_BULLETIN` in position 1 when configured `[EU_WEEKLY_OIL_BULLETIN, PRETCARBURANT_LIVE, PRETCARBURANT_DATA]`, while ordering `PRETCARBURANT_DATA` before `PRETCARBURANT_LIVE`.
- `FuelPriceHealthService.getHealthStatus()` reflects custom priority order (`priority = 1, 2, 3` and `isPrimary`).

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.fuel.FuelPriceServiceTest --no-daemon`
Expected: FAIL (compilation error: `getProviderPriority` / `saveProviderPriority` not defined).

- [ ] **Step 3: Implement priority methods in `HttpFuelPriceProvider` and update `FuelPriceHealthService`**

- In `FuelPriceProvider.kt`: inject `private val appSettingRepository: AppSettingRepository? = null` into `HttpFuelPriceProvider` (default `null` preserves existing 2-arg test instantiations if any).
- Implement `getProviderPriority()`: read `appSettingRepository?.findById("fuel_provider_priority")`, parse JSON list, filter to `EXTERNAL_SOURCES`, `.distinct()`, append missing `EXTERNAL_SOURCES`, fallback to `EXTERNAL_SOURCES`.
- Implement `saveProviderPriority(priority: List<FuelPriceSource>)`: filter to `EXTERNAL_SOURCES`, `.distinct()`, append missing `EXTERNAL_SOURCES`, serialize as JSON and save `AppSetting(key = "fuel_provider_priority", ...)`.
- Implement `resolvePriorityForDate(requestedDate: LocalDate, today: LocalDate): List<FuelPriceSource>`: take `getProviderPriority()`; if `requestedDate.isBefore(today)` and `indexOf(PRETCARBURANT_LIVE) < indexOf(PRETCARBURANT_DATA)`, swap `PRETCARBURANT_LIVE` and `PRETCARBURANT_DATA` positions. Use this in `resolve()`.
- In `FuelPriceHealthService.kt`: replace `HttpFuelPriceProvider.EXTERNAL_SOURCES` in `runHealthCheck()` and `getHealthStatus()` with `httpFuelPriceProvider.getProviderPriority()`.

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.services.fuel.FuelPriceServiceTest --no-daemon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/FuelPriceProvider.kt \
        backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/fuel/FuelPriceHealthService.kt \
        backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/fuel/FuelPriceServiceTest.kt
git commit -m "feat(fuel): support configurable external fuel provider priority"
```

---

### Task 2: Backend REST Endpoints & Role Permissions

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/settings/SettingsDtos.kt:163-171`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt:55-155`
- Create: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/FuelProvidersControllerTest.kt`

**Interfaces:**
- Consumes: `HttpFuelPriceProvider.getProviderPriority()`, `HttpFuelPriceProvider.saveProviderPriority(...)`
- Produces:
  - `GET /api/settings/fuel-providers` -> `FuelProvidersOut(providers: List<String>, availableProviders: List<String>)`
  - `PATCH /api/settings/fuel-providers` (`FuelProvidersUpdate(providers: List<String>)`) -> `FuelProvidersOut`

- [ ] **Step 1: Write failing controller tests in `FuelProvidersControllerTest.kt`**

Test with MockMvc + Spring Security:
- `GET /api/settings/fuel-providers` succeeds (`200`) for `mod` and `chef_finance`, returns `403` for `technician`.
- `PATCH /api/settings/fuel-providers` succeeds (`200`) for `mod` and `chef_finance`, calls `saveProviderPriority(...)`, returns `403` for `technician`.
- `PATCH /api/settings/fuel-providers` with `["MANUAL_SETTING"]` or `["INVALID"]` or `[]` returns `400 Bad Request`.

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.FuelProvidersControllerTest --no-daemon`
Expected: FAIL (404 / missing endpoint & DTOs).

- [ ] **Step 3: Add DTOs and `AppSettingsController` endpoints**

- In `SettingsDtos.kt`: add `FuelProvidersOut(val providers: List<String>, @JsonProperty("available_providers") val availableProviders: List<String>)` and `FuelProvidersUpdate(@field:NotEmpty val providers: List<String>)`.
- In `AppSettingsController.kt`: inject `httpFuelPriceProvider: HttpFuelPriceProvider`. Add `@GetMapping("/fuel-providers")` and `@PatchMapping("/fuel-providers")` both with `@PreAuthorize("hasAnyRole('mod', 'chef_finance')")`, parsing `FuelPriceSource` values that are in `HttpFuelPriceProvider.EXTERNAL_SOURCES` (returning `400` if parsed list is empty).

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests eu.nt.xpenses.controllers.FuelProvidersControllerTest --no-daemon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/settings/SettingsDtos.kt \
        backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AppSettingsController.kt \
        backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/FuelProvidersControllerTest.kt
git commit -m "feat(api): add fuel-providers priority endpoints for mod and chef_finance"
```

---

### Task 3: Frontend API, i18n, and Reorder UI in `FuelPriceHealthCard`

**Files:**
- Modify: `frontend/lib/types/admin.ts`
- Modify: `frontend/lib/api/admin.ts:29-38`
- Modify: `frontend/lib/api.ts:265-275`
- Modify: `frontend/lib/queryKeys.ts:38-45`
- Modify: `frontend/messages/ro.json`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/app/admin/settings/SettingsClient.tsx:535-749`

**Interfaces:**
- Consumes: `GET /api/settings/fuel-providers`, `PATCH /api/settings/fuel-providers`
- Produces: `getFuelProviders()`, `updateFuelProviders(providers: string[])`, `settingsKeys.fuelProviders()`, reorderable `FuelPriceHealthCard` for `mod` & `chef_finance`.

- [ ] **Step 1: Add TypeScript types, query key, and API functions**

- In `frontend/lib/types/admin.ts`: add `FuelProvidersConfig` (`{ providers: string[]; available_providers: string[] }`).
- In `frontend/lib/queryKeys.ts`: add `fuelProviders: () => [...settingsKeys.all, "fuel-providers"] as const`.
- In `frontend/lib/api/admin.ts` & re-export in `frontend/lib/api.ts`: add `getFuelProviders()` and `updateFuelProviders(providers: string[])`.

- [ ] **Step 2: Add Romanian & English i18n keys**

Add to `frontend/messages/ro.json` and `frontend/messages/en.json` under `"admin"`:
- `fuel_providers_saved`
- `fuel_providers_save_failed`
- `fuel_priority_move_up`
- `fuel_priority_move_down`

- [ ] **Step 3: Update `FuelPriceHealthCard` in `SettingsClient.tsx`**

Mirror `FxProvidersSection`:
- Query `useQuery<FuelProvidersConfig>({ queryKey: settingsKeys.fuelProviders(), queryFn: getFuelProviders })`.
- Maintain local `providers` state initialized from `fuelProvidersData?.providers` (fallback to `fuelStatus?.providers.map(p => p.provider)` or default 3 sources).
- Add `moveProvider(index, "up" | "down")` with Up/Down `ArrowUp` / `ArrowDown` icon buttons and accessible `aria-label`s.
- Add `Save` button calling `updateFuelProviders(providers)`, invalidating `settingsKeys.fuelProviders()` and `settingsKeys.fuelStatus()`, and showing `role="status"` success / `role="alert"` error feedback.

- [ ] **Step 4: Run frontend checks**

Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/types/admin.ts frontend/lib/api/admin.ts frontend/lib/api.ts \
        frontend/lib/queryKeys.ts frontend/messages/ro.json frontend/messages/en.json \
        frontend/app/admin/settings/SettingsClient.tsx
git commit -m "feat(ui): allow mod and chef_finance to reorder fuel price sources"
```
