# Trip Sheet ("Foaie de parcurs") Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a ready-to-print `.xlsx` **Foaie de parcurs** directly from any ExpenseReport's mileage records, complete with company header, vehicle/driver metadata, monthly tabs, cumulative odometer formulas, `Dus / Întors` markers, and signature lines.

**Architecture:** Add migration `V109__trip_sheet_fields.sql` introducing `vehicle_category` (default `M1`) and `last_odometer_km` on `user_vehicles`, `starting_odometer_km` on `expense_reports`, and `round_trip` + `vehicle_category` snapshot on `mileage_records`. Build a dedicated Apache POI `TripSheetExportService` behind `GET /api/reports/{reportId}/mileage/trip-sheet` that generates clean 12-column (`A–L`) monthly worksheets with live Excel formulas, and wire starting odometer, `Dus / Întors`, and `.xlsx` download controls into `/profile`, `/reports/[id]/mileage`, and `/reports/[id]`.

**Tech Stack:** Kotlin, Spring Boot, JPA/Hibernate, PostgreSQL + Flyway, Apache POI (`XSSFWorkbook`), JUnit 5 + MockMvc (`IntegrationTestBase`), Next.js 16, React 19, TypeScript, TanStack Query, `next-intl`, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-20-trip-sheet-excel-design.md`

## Global Constraints

- **Production host guardrails (`AGENTS.md`):** Never run `docker compose down` or `make down`. Always run Gradle with `--no-daemon` and targeted test classes (`./gradlew test --tests <ClassName> --no-daemon`).
- **Database migrations:** Never edit applied migrations. Add `V109__trip_sheet_fields.sql` (next after `V108__user_vehicles_and_mileage_link.sql`).
- **Frontend verification:** Run `cd frontend && npm run typecheck && npm run i18n:check && npm run lint` (0 warnings, full `en.json`/`ro.json` parity).
- **Round trip behavior:** `round_trip` is strictly an informational marker (`x` in Excel); it must NEVER double `distance_km`.
- **Excel formula injection:** Sanitize user-supplied strings (`origin`, `destination`, `description`, `displayName`, `plateNumber`, `makeModel`, `title`, `kundenauftrag`) starting with `=`, `+`, `-`, `@` (prefix with `'`) before writing to cells.
- **Timezone:** Format `Ora`/`Data` and group monthly tabs in `Europe/Bucharest`.
- **Accounting policy (`CONTEXT.md`):** Mileage remains excluded from PDF report reimbursement totals.

## Review Focus

1. **Formula injection via user-entered route/purpose/plate strings (e.g. `origin = "=CMD|..."` or `description = "+1+1"`):** `TripSheetExportService` must sanitize all user-supplied text cells while keeping legitimate numeric/formula cells (`=L5+L7`, `=SUM(...)`) untouched. *(Pinned in Task 2)*
2. **Multi-month odometer continuation & multi-year sheet naming:** A report with trips in December 2026 and January 2027 must create distinct valid sheet names (`Decembrie 2026`, `Ianuarie 2027`, <= 31 chars, no invalid Excel sheet chars `: \ / ? * [ ]`) and carry the ending odometer of month 1 into `L5` of month 2. *(Pinned in Task 2)*
3. **Submitting a report with `starting_odometer_km` must never regress `vehicle.last_odometer_km`:** If an older report is submitted late with a lower ending odometer than the vehicle's current `last_odometer_km`, `last_odometer_km` must NOT move backwards; and if a report has multiple vehicles, only the primary vehicle (earliest trip chronologically) advances by its own trip km. *(Pinned in Task 1)*
4. **Empty odometer export (`starting_odometer_km == null`):** Generating a trip sheet without a starting odometer must succeed with blank `L5`, `L6`, `J12..`, `K12..`, `K{total}` cells (no `NullPointerException` or `#VALUE!` formula errors) while `L7` and `L{total}` still sum `distance_km`. *(Pinned in Task 2)*
5. **Authorization on `GET /api/reports/{reportId}/mileage/trip-sheet`:** Report owner, managers, `chef_finance`, and `mod` can download (`200`), an unrelated technician gets `403`, and a report with 0 mileage records returns `400`. *(Pinned in Task 2)*

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend-kotlin-jpa/src/main/resources/db/migration/V109__trip_sheet_fields.sql` | Create | Add `vehicle_category`, `last_odometer_km` on `user_vehicles`; `starting_odometer_km` on `expense_reports`; `round_trip`, `vehicle_category` on `mileage_records` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/UserVehicle.kt` | Modify | Add `vehicleCategory` and `lastOdometerKm` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/vehicle/UserVehicleDtos.kt` | Modify | Expose/accept `vehicle_category`, `last_odometer_km`, `clear_last_odometer` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserVehicleController.kt` | Modify | Validate & persist `vehicle_category` (default `M1`) and `last_odometer_km` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/ExpenseReport.kt` | Modify | Add `startingOdometerKm` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/ReportUpdate.kt` | Modify | Add `starting_odometer_km`, `clear_starting_odometer` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/ReportOut.kt` | Modify | Expose `starting_odometer_km` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt` | Modify | Update `starting_odometer_km` on draft `PATCH`; advance primary vehicle `last_odometer_km` on `POST /submit` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt` | Modify | Map `starting_odometer_km` on `ReportOut` and `round_trip`, `vehicle_category` on `MileageRecordOut` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt` | Modify | Add `roundTrip` and `vehicleCategory` snapshot |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt` | Modify | Add `round_trip: Boolean = false` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt` | Modify | Add `round_trip: Boolean? = null` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt` | Modify | Expose `round_trip`, `vehicle_category` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` | Modify | Persist `roundTrip` + `vehicleCategory` snapshot; add `GET /trip-sheet` endpoint |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/TripSheetExportService.kt` | Create | Programmatic Apache POI `.xlsx` generator matching the 12-column `A–L` layout |
| `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/TripSheetExportServiceTest.kt` | Create | POI unit tests for layout, formulas, multi-month carry-over, multi-vehicle, blank odometer, sanitization |
| `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt` | Modify | Tests for `vehicle_category` & `last_odometer_km` |
| `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt` | Modify | Tests for `round_trip`, `vehicle_category` snapshot, `starting_odometer_km`, submit advancement, and `GET /trip-sheet` |
| `frontend/lib/types/vehicle.ts` | Modify | Add `vehicle_category`, `last_odometer_km`, `clear_last_odometer` |
| `frontend/lib/types/report.ts` | Modify | Add `starting_odometer_km` on `Report`; `round_trip`, `vehicle_category` on `MileageRecord` |
| `frontend/components/profile/VehiclesSection.tsx` | Modify | Add Vehicle Category (`M1` default) & optional Last Odometer fields |
| `frontend/app/reports/[id]/mileage/page.tsx` | Modify | Starting odometer bar with vehicle prefill chip, `Dus / Întors` checkbox & badge, `.xlsx` download button |
| `frontend/app/reports/[id]/ReportDetailClient.tsx` | Modify | Add "Foaie de parcurs (.xlsx)" export button when report has mileage records |
| `frontend/messages/en.json` & `frontend/messages/ro.json` | Modify | Add all new i18n keys in parity |

---

### Task 1: Backend Schema `V109` + Vehicle Category/Odometer, Report Starting Odometer & Mileage `round_trip`

**Files:**
- Create: `backend-kotlin-jpa/src/main/resources/db/migration/V109__trip_sheet_fields.sql`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/UserVehicle.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/vehicle/UserVehicleDtos.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserVehicleController.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/ExpenseReport.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/ReportUpdate.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/ReportOut.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt`, `MileageControllerTest.kt`

**Interfaces:**
- Consumes: `V108` schema, `UserVehicleController`, `MileageController`, `ReportController`
- Produces:
  - `UserVehicle.vehicleCategory: String = "M1"`, `UserVehicle.lastOdometerKm: BigDecimal? = null`
  - `ExpenseReport.startingOdometerKm: BigDecimal? = null`
  - `MileageRecord.roundTrip: Boolean = false`, `MileageRecord.vehicleCategory: String? = null`
  - `PATCH /api/reports/{id}` supports `starting_odometer_km` (`>= 0`, scale 1) and `clear_starting_odometer: Boolean = false`
  - `POST /api/reports/{id}/submit` advances primary vehicle's `last_odometer_km` monotonically (`starting_odometer_km + primaryVehicleKm`) when `starting_odometer_km != null`

- [ ] **Step 1: Write Flyway migration `V109__trip_sheet_fields.sql`**

Add columns:
- `user_vehicles`: `vehicle_category VARCHAR(16) NOT NULL DEFAULT 'M1'`, `last_odometer_km NUMERIC(10,1)`
- `expense_reports`: `starting_odometer_km NUMERIC(10,1)`
- `mileage_records`: `round_trip BOOLEAN NOT NULL DEFAULT FALSE`, `vehicle_category VARCHAR(16)`

- [ ] **Step 2: Write failing integration tests in `UserVehicleControllerTest.kt` and `MileageControllerTest.kt`**

Add tests:
1. `UserVehicleControllerTest`: creating a vehicle without `vehicle_category` defaults to `"M1"`; creating/updating with `vehicle_category: " n1 "` normalizes to `"N1"` and rejects `> 16` chars (`400`); `last_odometer_km` accepts `375000.5`, rejects negative values (`400`), and clears via `clear_last_odometer: true`.
2. `MileageControllerTest`: `POST` mileage with `round_trip: true` and a vehicle (`vehicle_category: "N1"`) persists `round_trip == true`, `vehicle_category == "N1"`, and does NOT double `distance_km`; `PATCH` report sets & clears `starting_odometer_km`; `POST /api/reports/{id}/submit` (with 1 expense + mileage + `starting_odometer_km: 375000.0` + 50 km trip) advances `vehicle.last_odometer_km` to `375050.0` and does NOT regress it if a second report submits with a lower odometer (`300000.0`).

- [ ] **Step 3: Run tests to verify RED**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests UserVehicleControllerTest --tests MileageControllerTest --no-daemon`
Expected: FAIL on the new assertions.

- [ ] **Step 4: Implement model, DTO, mapper, and controller updates**

- Validate `vehicle_category` (default `"M1"` when omitted/blank on create, trimmed uppercase, max 16 chars) and `last_odometer_km` (`>= 0`, `<= 9999999.9`, max 1 decimal place, normalized `.setScale(1, RoundingMode.HALF_UP)`).
- Validate `starting_odometer_km` on `ReportController.updateReport` (same `>= 0`, `<= 9999999.9`, scale 1 rule; `clear_starting_odometer: true` sets `null`).
- In `ReportController.submitReport`: if `report.startingOdometerKm != null`, load `mileageRecordRepository.findAllByReportId(reportId)` sorted by `startTime ASC, id ASC`; find the primary vehicle (`firstOrNull()?.vehicle`); if non-null, sum `distanceKm` for trips belonging to that vehicle, compute `endingOdometer = startingOdometerKm + totalPrimaryKm` (scaled 1 decimal), and update `vehicle.lastOdometerKm` only if `existing == null || endingOdometer > existing`.
- Snapshot `vehicle?.vehicleCategory` and persist `body.roundTrip` on `MileageRecord` create/update, and expose both in `MileageController.mapRecordToOut` and `ReportMapper.mapRecordToOut`.

- [ ] **Step 5: Run targeted backend tests to verify GREEN**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests UserVehicleControllerTest --tests MileageControllerTest --tests ReportControllerImportOrderTest --no-daemon`
Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend-kotlin-jpa/src/main/resources/db/migration/V109__trip_sheet_fields.sql \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/ \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt
git commit -m "feat(backend): add trip sheet fields (vehicle category, odometer, round_trip)"
```

---

### Task 2: Backend `TripSheetExportService` (Apache POI `.xlsx`) & `GET /api/reports/{reportId}/mileage/trip-sheet`

**Files:**
- Create: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/TripSheetExportService.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/TripSheetExportServiceTest.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt`

**Interfaces:**
- Consumes: `ExpenseReport`, `MileageRecord` (with `roundTrip`, `vehicleCategory`, `vehiclePlate`, `vehicleMakeModel`, `vehicleFuelType`, `fuelConsumptionLitersPer100Km`), `User`, `@Value("\${company.name:Newtech Automation}")`
- Produces:
  - `TripSheetExportService.buildTripSheet(report: ExpenseReport, records: List<MileageRecord>): ByteArray`
  - `GET /api/reports/{reportId}/mileage/trip-sheet` returning `.xlsx` attachment `foaie_parcurs_raport_{reportId}_{yyyy-MM-dd}.xlsx`

- [ ] **Step 1: Write failing unit tests `TripSheetExportServiceTest.kt` and endpoint tests in `MileageControllerTest.kt`**

In `TripSheetExportServiceTest.kt` (parsing returned `ByteArray` back with `XSSFWorkbook(ByteArrayInputStream(bytes))`):
1. `single month single vehicle generates exact 12-column layout with company header, formulas, and signature footer` — verifies sheet name `"Aprilie"`, `A1` company name, `A2` report title + `kundenauftrag`, `A4` `"Foaie de parcurs pentru autovehicule"`, `C5` `"APRILIE"`, `C6` driver name, `G5` `"Audi A6 - GJ01POA"`, `G6` `"M1"`, `G7` `"Diesel"`, `G8` `"0,08 (L/km)"`, `L5` `375000.0`, `L6` formula `"L5+L7"`, `L7` formula `"SUM(L12:L13)"`, merged regions (`A4:L4`, `A10:A11`, `B10:C10`, `D10:E10`, `F10:I10`, `J10:L10`), row 12/13 values (`Europe/Bucharest` `HH:mm` / `dd.MM.yyyy`, `"x"` for `round_trip=true`, `J12` formula `"L5"`, `K12` formula `"J12+L12"`, `J13` formula `"K12"`), total row `14`, signature rows `16–17`, and A4 landscape print setup.
2. `multi-month and multi-year trips create separate tabs and carry odometer across months` — trips in Dec 2026 (1000 km) and Jan 2027 (50 km) with `startingOdometerKm = 375000.0` produce sheets `"Decembrie 2026"` (`L5 = 375000.0`) and `"Ianuarie 2027"` (`L5 = 376000.0`).
3. `multi-vehicle report names sheets per month and vehicle, applying starting odometer only to primary vehicle` — trips for `GJ01POA` and `B99XYZ` in April produce `"Aprilie - GJ01POA"` (with `L5` set) and `"Aprilie - B99XYZ"` (`L5` blank, `L7` still sums distance).
4. `null starting odometer leaves odometer cells blank while summing total distance` — `L5`, `L6`, `J12`, `K12`, `K{total}` are blank; `L7` and `L{total}` still have `SUM` formulas.
5. `sanitizes Excel formula injection in user-supplied strings` — `origin = "=CMD|'/C calc'!A0"`, `description = "+SUM(A1:A2)"` are prefixed with `'` while real workbook formulas (`L6`, `L7`, `K12`) remain `CellType.FORMULA`.

In `MileageControllerTest.kt`:
- `GET /api/reports/{id}/mileage/trip-sheet` returns `200` + valid `.xlsx` content type for owner and manager, `400` when report has no mileage records, `403` for unrelated technician.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests TripSheetExportServiceTest --tests MileageControllerTest --no-daemon`
Expected: FAIL (`TripSheetExportService` missing / 404 on `/trip-sheet`).

- [ ] **Step 3: Implement `TripSheetExportService.kt` and `GET /trip-sheet` in `MileageController.kt`**

- Implement `TripSheetExportService` following Section 4.3 of the design spec verbatim (clean 12-column `A–L`, `Europe/Bucharest` timezone, Romanian month names, fuel labels `Benzină`/`Diesel`/`Hibrid`/`Electric`/`GPL`, `L/km` formatted with comma, formula-injection sanitizer, safe 31-char sheet names, A4 landscape fit-to-1-page-wide print setup, borders & bold headers).
- In `MileageController.kt`, add `@GetMapping("/trip-sheet") @Transactional(readOnly = true)` verifying ownership via `reportOwnership.verifyOwnership(reportId, currentUser)`, returning `400` if `records.isEmpty()`, and returning the `.xlsx` `ResponseEntity<ByteArray>` with `Content-Disposition: attachment; filename="foaie_parcurs_raport_${reportId}_${LocalDate.now(ZoneId.of("Europe/Bucharest"))}.xlsx"`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests TripSheetExportServiceTest --tests MileageControllerTest --no-daemon`
Expected: PASS (all unit + integration tests green).

- [ ] **Step 5: Commit Task 2**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/TripSheetExportService.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/services/TripSheetExportServiceTest.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt
git commit -m "feat(backend): add Apache POI TripSheetExportService and /mileage/trip-sheet endpoint"
```

---

### Task 3: Frontend Types, i18n & Profile Vehicle Category / Last Odometer

**Files:**
- Modify: `frontend/lib/types/vehicle.ts`
- Modify: `frontend/lib/types/report.ts`
- Modify: `frontend/components/profile/VehiclesSection.tsx`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ro.json`

**Interfaces:**
- Consumes: updated `/api/users/me/vehicles` (`vehicle_category`, `last_odometer_km`, `clear_last_odometer`) from Task 1
- Produces:
  - Updated `UserVehicle`, `UserVehicleCreatePayload`, `UserVehicleUpdatePayload`, `Report`, `MileageRecord` types
  - i18n keys for profile (`vehicle_category`, `vehicle_category_placeholder`, `last_odometer_km`, `last_odometer_placeholder`, `last_odometer_invalid`) and reports (`mileage_round_trip`, `mileage_starting_odometer`, `mileage_starting_odometer_placeholder`, `mileage_starting_odometer_save`, `mileage_starting_odometer_saved`, `mileage_starting_odometer_invalid`, `mileage_starting_odometer_prefill`, `mileage_export_trip_sheet`, `mileage_export_trip_sheet_error`)

- [ ] **Step 1: Update TypeScript types in `vehicle.ts` and `report.ts`**

Add `vehicle_category: string`, `last_odometer_km: number | null` (and `clear_last_odometer?: boolean`) to vehicle types; add `starting_odometer_km: number | null` to `Report` and `round_trip: boolean`, `vehicle_category: string | null` to `MileageRecord`.

- [ ] **Step 2: Add all new i18n keys to `en.json` and `ro.json`**

Ensure exact key parity between `frontend/messages/en.json` and `frontend/messages/ro.json`.

- [ ] **Step 3: Update `VehiclesSection.tsx`**

- Add **Vehicle Category** input (with `<datalist>` quick suggestions `M1`, `N1`, `M2`, `N2`, default `"M1"`, `maxLength={16}`) and optional **Last Odometer (km)** input (parsed with `parseLocaleNumber`, validated `>= 0` and max 1 decimal place, sending `clear_last_odometer: true` on `PATCH` when cleared).
- Display category badge (`M1`) and last odometer (when present) on each vehicle card.

- [ ] **Step 4: Run frontend verification**

Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
Expected: Exit code 0, 0 warnings.

- [ ] **Step 5: Commit Task 3**

```bash
git add frontend/lib/types/vehicle.ts frontend/lib/types/report.ts \
  frontend/components/profile/VehiclesSection.tsx \
  frontend/messages/en.json frontend/messages/ro.json
git commit -m "feat(web): add vehicle category and last odometer to profile vehicles"
```

---

### Task 4: Frontend Starting Odometer, `Dus / Întors`, and Trip Sheet `.xlsx` Download

**Files:**
- Modify: `frontend/app/reports/[id]/mileage/page.tsx`
- Modify: `frontend/app/reports/[id]/ReportDetailClient.tsx`

**Interfaces:**
- Consumes: `GET /api/reports/{id}/mileage/trip-sheet`, `PATCH /api/reports/{id}` (`starting_odometer_km` / `clear_starting_odometer`), `POST /api/reports/{id}/mileage` (`round_trip`), and i18n keys from Task 3
- Produces: Complete web UI for entering starting odometer (with one-click prefill from vehicle's `last_odometer_km`), marking trips `Dus / Întors`, and downloading the `.xlsx` *Foaie de parcurs* from both `/reports/[id]/mileage` and `/reports/[id]`

- [ ] **Step 1: Update `frontend/app/reports/[id]/mileage/page.tsx`**

- Add **"Descarcă Foaie de parcurs (.xlsx)"** button in the page header when `records.length > 0` (authenticated blob download via `api.get(\`/reports/${id}/mileage/trip-sheet\`, { responseType: "blob" })`, triggering browser download and showing error banner on failure).
- Add a compact **Kilometraj la plecare (bord)** card above the trip form/list:
  - When `report.status === "draft"`: numeric input (`parseLocaleNumber`), Save button calling `PATCH /reports/${id}` (`starting_odometer_km` or `clear_starting_odometer: true`), plus a one-click prefill chip (`Folosește {km} km`) whenever `starting_odometer_km` is unset and the default/selected vehicle has `last_odometer_km != null`.
  - When `report.status !== "draft"` and `report.starting_odometer_km != null`: read-only display of starting and ending odometer (`starting_odometer_km` → `starting_odometer_km + totalKm`).
- In the Add Trip form: add **"Dus / Întors"** checkbox (`roundTrip`, default `false`) and pass `round_trip: roundTrip` in `POST /reports/${id}/mileage` (reset to `false` on submit).
- In the trip list (both desktop table and mobile cards): render a small badge when `m.round_trip === true`.

- [ ] **Step 2: Add "Foaie de parcurs (.xlsx)" button to `frontend/app/reports/[id]/ReportDetailClient.tsx`**

Alongside the existing report export buttons, render a download button calling `/reports/${id}/mileage/trip-sheet` (blob download) whenever `(report.mileage_records?.length ?? 0) > 0`.

- [ ] **Step 3: Run full frontend checks & targeted backend tests**

Run:
```bash
cd frontend && npm run typecheck && npm run i18n:check && npm run lint
cd ../backend-kotlin-jpa && ./gradlew test --tests TripSheetExportServiceTest --tests UserVehicleControllerTest --tests MileageControllerTest --tests ReportControllerImportOrderTest --no-daemon
```
Expected: Both commands exit 0 with all checks and tests passing.

- [ ] **Step 4: Commit Task 4**

```bash
git add frontend/app/reports/[id]/mileage/page.tsx frontend/app/reports/[id]/ReportDetailClient.tsx
git commit -m "feat(web): add starting odometer, round-trip flag, and trip sheet Excel download"
```

---

## Self-Review Check
- **Spec coverage:** `V109` fields + submit odometer advancement (Task 1); Apache POI `TripSheetExportService` 12-column layout + company header + signatures + `/mileage/trip-sheet` endpoint + sanitization (Task 2); Profile UI + types + i18n (Task 3); Report mileage odometer bar, prefill chip, `Dus / Întors`, and `.xlsx` download on both `/reports/[id]/mileage` and `/reports/[id]` (Task 4). No gaps.
- **Type consistency:** `vehicle_category`, `last_odometer_km`, `clear_last_odometer`, `starting_odometer_km`, `clear_starting_odometer`, `round_trip`, `/mileage/trip-sheet` match across all 4 tasks.
- **Review Focus:** All 5 failure modes are pinned to tests in Tasks 1 and 2.
