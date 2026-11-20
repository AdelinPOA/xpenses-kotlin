# Web Profile Access, User Vehicles & Report Mileage Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `/profile` as the first item in the web left sidebar, let users manage a list of vehicles (with one default and optional per-vehicle fuel consumption) in `/profile`, and link vehicles to report mileage trips with historical snapshots for future *foaie de parcurs* generation.

**Architecture:** Add a `user_vehicles` table (`V108` Flyway migration) with `/api/users/me/vehicles` CRUD endpoints, extend `mileage_records` with a nullable `vehicle_id` FK (`ON DELETE SET NULL`) plus snapshot columns (`vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`), and use the selected vehicle's fuel consumption (falling back to global `mileage_fuel_consumption_l_per_100km`, default `7.5`) inside `MileageController`. On the web frontend, promote `/profile` to the top of `Sidebar`, add a self-contained `VehiclesSection` component to `/profile`, and add an optional default-preselected vehicle selector + trip vehicle display to `/reports/[id]/mileage`.

**Tech Stack:** Kotlin, Spring Boot, JPA/Hibernate, PostgreSQL + Flyway, JUnit 5 + MockMvc (`IntegrationTestBase`), Next.js 16, React 19, TypeScript, TanStack Query, `next-intl`, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-20-profile-vehicles-mileage-design.md`

## Global Constraints

- **Production host guardrails (`AGENTS.md`):** Never run `docker compose down` or `make down`. Always run Gradle with `--no-daemon` and target single test classes (`./gradlew test --tests <ClassName> --no-daemon`).
- **Database migrations:** Never edit applied migrations. Add `V108__user_vehicles_and_mileage_link.sql` (next after `V107__refresh_token_rotation_grace.sql`).
- **Frontend verification:** Run `cd frontend && npm run typecheck && npm run i18n:check && npm run lint` (eslint `--max-warnings 0`; full `en.json`/`ro.json` parity required).
- **Historical immutability:** Editing or deleting a vehicle must never mutate previously saved `mileage_records` snapshots (`vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`, `fuel_consumption_l_per_100km`).
- **Accounting policy (`CONTEXT.md`):** Mileage remains excluded from the PDF report reimbursement summary; do not alter PDF reimbursement totals.

## Review Focus

1. **Duplicate default vehicle race / constraint violation on `PATCH` or `POST` with `is_default=true`:** Setting a second vehicle as default must clear the previous default in the same transaction (`flush()` before inserting/updating `is_default = true`) so PostgreSQL's partial unique index `uq_user_vehicles_default` never throws a constraint violation. *(Pinned in Task 1)*
2. **Cross-user vehicle ID spoofing on mileage creation/update:** Submitting another user's `vehicle_id` to `POST /api/reports/{id}/mileage` or `PATCH /api/reports/{id}/mileage/{mileageId}` must fail with `404` and never leak another user's vehicle plate or consumption. *(Pinned in Task 2)*
3. **Editing or deleting a vehicle after trips exist:** Modifying a vehicle's plate/model/consumption or deleting the vehicle must leave existing `mileage_records` snapshots (`vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`, `fuel_consumption_l_per_100km`) untouched, with `vehicle_id` becoming `null` on delete. *(Pinned in Task 2)*
4. **Clearing optional fields on vehicle `PATCH` (e.g., removing custom fuel consumption to revert to global fallback):** Sending `clear_consumption: true` or `fuel_consumption_l_per_100km: null` via explicit update payload must actually clear the column rather than silently keeping the old value. *(Pinned in Task 1)*
5. **Sidebar active highlight collision between `/profile` and `/profile/signature` (or `/profile/[id]`):** Visiting `/profile/signature` must highlight only **Signature**, not **Profile**; visiting `/profile` must highlight only **Profile**. *(Pinned in Task 3)*

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend-kotlin-jpa/src/main/resources/db/migration/V108__user_vehicles_and_mileage_link.sql` | Create | `user_vehicles` table, partial unique default index, and `mileage_records` vehicle FK + snapshot columns |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/UserVehicle.kt` | Create | JPA entity for `user_vehicles` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/UserVehicleRepository.kt` | Create | Queries by user, ownership lookup, clear-defaults update |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/vehicle/UserVehicleDtos.kt` | Create | `UserVehicleCreate`, `UserVehicleUpdate`, `UserVehicleOut` DTOs |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserVehicleController.kt` | Create | `/api/users/me/vehicles` CRUD, validation, normalization, default promotion |
| `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt` | Create | Integration tests for vehicle CRUD, defaults, validation, isolation |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt` | Modify | Add nullable `vehicle` FK + `vehiclePlate`, `vehicleMakeModel`, `vehicleFuelType` snapshot fields |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt` | Modify | Add optional `vehicle_id` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt` | Modify | Add optional `vehicle_id` and `clear_vehicle` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt` | Modify | Expose `vehicle_id`, `vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type` |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt` | Modify | Resolve vehicle & consumption on create/update, persist snapshots, recalculate on vehicle change |
| `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt` | Modify | Map vehicle snapshot fields into `MileageRecordOut` |
| `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt` | Modify | Integration tests for vehicle linkage, per-vehicle consumption, fallback, isolation, snapshot immutability |
| `frontend/components/layout/nav.ts` | Modify | Move `/profile` to index 0 of `NAV` for all 4 roles |
| `frontend/components/layout/Sidebar.tsx` | Modify | Exact-match active check for `/profile` so `/profile/signature` does not double-highlight |
| `frontend/lib/types/vehicle.ts` | Create | `FuelType`, `UserVehicle`, `UserVehiclePayload` TypeScript types |
| `frontend/lib/types/index.ts` | Modify | Re-export `./vehicle` |
| `frontend/lib/types/report.ts` | Modify | Add vehicle fields to `MileageRecord` |
| `frontend/lib/queryKeys.ts` | Modify | Add `vehicleKeys` |
| `frontend/components/profile/VehiclesSection.tsx` | Create | Vehicles list + inline add/edit form + set default + delete confirmation |
| `frontend/app/profile/page.tsx` | Modify | Render `<VehiclesSection />` between Account Info and Password |
| `frontend/app/reports/[id]/mileage/page.tsx` | Modify | Fetch vehicles, preselect default in add-trip form, link to `/profile` when empty, display vehicle on trips |
| `frontend/messages/en.json` & `frontend/messages/ro.json` | Modify | Add vehicle & mileage-vehicle translations |

---

### Task 1: Backend `user_vehicles` Migration, Entity, Repository & `/api/users/me/vehicles` CRUD

**Files:**
- Create: `backend-kotlin-jpa/src/main/resources/db/migration/V108__user_vehicles_and_mileage_link.sql`
- Create: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/UserVehicle.kt`
- Create: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/UserVehicleRepository.kt`
- Create: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/vehicle/UserVehicleDtos.kt`
- Create: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserVehicleController.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt`

**Interfaces:**
- Consumes: `User` entity, `UserRepository`, `IntegrationTestBase`
- Produces:
  - DB table `user_vehicles` and new columns on `mileage_records` (`vehicle_id`, `vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`)
  - Entity `UserVehicle(id, user, plateNumber, makeModel, fuelType, fuelConsumptionLitersPer100Km, isDefault, createdAt, updatedAt)`
  - Repository `UserVehicleRepository` with `findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId: Int): List<UserVehicle>`, `findByIdAndUserId(id: Int, userId: Int): UserVehicle?`, `clearDefaultForUser(userId: Int)`
  - REST endpoints: `GET /api/users/me/vehicles`, `POST /api/users/me/vehicles`, `PATCH /api/users/me/vehicles/{vehicleId}`, `DELETE /api/users/me/vehicles/{vehicleId}`
  - JSON shape `UserVehicleOut`: `id`, `plate_number`, `make_model`, `fuel_type`, `fuel_consumption_l_per_100km`, `is_default`, `created_at`, `updated_at`

- [ ] **Step 1: Write the Flyway migration `V108__user_vehicles_and_mileage_link.sql`**

Create `backend-kotlin-jpa/src/main/resources/db/migration/V108__user_vehicles_and_mileage_link.sql` with:
- `user_vehicles` table (`id SERIAL PRIMARY KEY`, `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `plate_number VARCHAR(32) NOT NULL`, `make_model VARCHAR(120)`, `fuel_type VARCHAR(20)`, `fuel_consumption_l_per_100km NUMERIC(5,2)`, `is_default BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
- Indexes: `idx_user_vehicles_user_id ON user_vehicles(user_id)` and partial unique index `uq_user_vehicles_default ON user_vehicles(user_id) WHERE is_default = TRUE`.
- `ALTER TABLE mileage_records` adding `vehicle_id INTEGER REFERENCES user_vehicles(id) ON DELETE SET NULL`, `vehicle_plate VARCHAR(32)`, `vehicle_make_model VARCHAR(120)`, `vehicle_fuel_type VARCHAR(20)`, and `idx_mileage_records_vehicle_id ON mileage_records(vehicle_id)`.

- [ ] **Step 2: Write the failing integration test `UserVehicleControllerTest.kt`**

Create `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt` extending `IntegrationTestBase()` with tests:
1. `POST first vehicle normalizes plate uppercase and auto-sets is_default true` — posts `{"plate_number":" b 123 xyz ","make_model":"Dacia Duster","fuel_type":"diesel","fuel_consumption_l_per_100km":6.5}`, expects `201`, `plate_number == "B 123 XYZ"`, `is_default == true`, `fuel_consumption_l_per_100km == 6.5`.
2. `POST second vehicle with is_default true clears previous default without constraint error` — creates two vehicles, second with `is_default: true`; `GET /api/users/me/vehicles` returns second first (`is_default == true`) and first second (`is_default == false`).
3. `PATCH vehicle updates fields, switches default, and clears optional consumption when requested` — updates make/model, switches `is_default: true` back to first vehicle, and sends `clear_fuel_consumption: true` to verify `fuel_consumption_l_per_100km` becomes `null`.
4. `DELETE default vehicle promotes oldest remaining vehicle to default` — creates 2 vehicles, deletes the default one (`204`), `GET` shows remaining vehicle now has `is_default == true`.
5. `Validation rejects invalid fuel_type, non-positive or over-50 consumption, and blank plate` — expects `400` for `fuel_type: "nuclear"`, `fuel_consumption_l_per_100km: 0`, `fuel_consumption_l_per_100km: 55`, and blank `plate_number`.
6. `Ownership isolation prevents another user from seeing, patching, or deleting vehicle` — `tech1` creates a vehicle; `tech2` (or `manager1`) sees empty list on `GET` and gets `404` on `PATCH`/`DELETE` of `tech1`'s vehicle ID.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests UserVehicleControllerTest --no-daemon`
Expected: FAIL (404 on `/api/users/me/vehicles` or missing classes).

- [ ] **Step 4: Implement `UserVehicle`, `UserVehicleRepository`, `UserVehicleDtos`, and `UserVehicleController`**

- `UserVehicle.kt`: `@Entity @Table(name = "user_vehicles")` mapping all columns from `V108`.
- `UserVehicleRepository.kt`: extends `JpaRepository<UserVehicle, Int>` with:
  - `fun findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId: Int): List<UserVehicle>`
  - `fun findByIdAndUserId(id: Int, userId: Int): UserVehicle?`
  - `fun countByUserId(userId: Int): Long`
  - `@Modifying(flushAutomatically = true, clearAutomatically = true) @Query("UPDATE UserVehicle v SET v.isDefault = false, v.updatedAt = :now WHERE v.user.id = :userId AND v.isDefault = true") fun clearDefaultForUser(userId: Int, now: Instant)`
- `UserVehicleDtos.kt`:
  - `UserVehicleCreate(plateNumber, makeModel, fuelType, fuelConsumptionLitersPer100Km, isDefault)`
  - `UserVehicleUpdate(plateNumber, makeModel, clearMakeModel, fuelType, clearFuelType, fuelConsumptionLitersPer100Km, clearFuelConsumption, isDefault)`
  - `UserVehicleOut(id, plateNumber, makeModel, fuelType, fuelConsumptionLitersPer100Km, isDefault, createdAt, updatedAt)` with `@JsonProperty` snake_case names.
- `UserVehicleController.kt`: `@RestController @RequestMapping("/api/users/me/vehicles")`.
  - Allowed `fuel_type` values: `setOf("petrol", "diesel", "hybrid", "electric", "lpg")`.
  - Normalize `plate_number`: `trim().uppercase()` (reject if blank or `> 32` chars).
  - Validate `fuel_consumption_l_per_100km`: if non-null, must be `> 0` and `<= 50.00`.
  - Flush `clearDefaultForUser` before saving any vehicle with `isDefault = true` so `uq_user_vehicles_default` is never violated.
  - On `DELETE`: if deleted vehicle had `isDefault == true`, promote the oldest remaining vehicle for `currentUser` to `isDefault = true`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests UserVehicleControllerTest --no-daemon`
Expected: PASS (all 6 tests green).

- [ ] **Step 6: Commit Task 1**

```bash
git add backend-kotlin-jpa/src/main/resources/db/migration/V108__user_vehicles_and_mileage_link.sql \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/UserVehicle.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/UserVehicleRepository.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/vehicle/UserVehicleDtos.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/UserVehicleController.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/UserVehicleControllerTest.kt
git commit -m "feat(backend): add user_vehicles schema and /api/users/me/vehicles CRUD"
```

---

### Task 2: Link `UserVehicle` to `MileageRecord`, Per-Vehicle Consumption & Snapshots

**Files:**
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt`
- Modify: `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt`
- Test: `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt`

**Interfaces:**
- Consumes: `UserVehicle`, `UserVehicleRepository.findByIdAndUserId(id, userId)` from Task 1
- Produces:
  - `POST /api/reports/{reportId}/mileage` accepts optional `vehicle_id: Int?`
  - `PATCH /api/reports/{reportId}/mileage/{mileageId}` accepts optional `vehicle_id: Int?` and `clear_vehicle: Boolean = false`
  - `MileageRecordOut` includes `vehicle_id`, `vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type` (both from `MileageController` and embedded in `GET /api/reports/{id}` via `ReportMapper`)

- [ ] **Step 1: Add failing tests to `MileageControllerTest.kt`**

Add integration tests to `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt`:
1. `POST mileage with vehicle uses vehicle consumption and stores snapshot` — create vehicle (`B-99-TST`, `Skoda Octavia`, `diesel`, `fuel_consumption_l_per_100km: 6.0`), POST mileage with `vehicle_id`; verify `201`, `vehicle_id == vehicle.id`, `vehicle_plate == "B-99-TST"`, `vehicle_make_model == "Skoda Octavia"`, `vehicle_fuel_type == "diesel"`, `fuel_consumption_l_per_100km == 6.0`, and `fuel_cost_eur` matches `6.0` (differs from default `7.5`).
2. `POST mileage with vehicle lacking consumption falls back to global 7.5` — create vehicle with `fuel_consumption_l_per_100km: null`, POST mileage; verify `fuel_consumption_l_per_100km == 7.5` and `vehicle_plate` snapshot is stored.
3. `POST mileage with another user's vehicle returns 404` — create vehicle as `manager1`, POST mileage as `tech1` with that `vehicle_id`; expect `404`.
4. `PATCH mileage switching vehicle and clearing vehicle recalculates consumption and updates snapshot` — switch from vehicle A (`6.0`) to vehicle B (`9.0`), verify consumption becomes `9.0` and snapshot updates; then PATCH `clear_vehicle: true`, verify `vehicle_id` and `vehicle_plate` become `null` and consumption reverts to `7.5`.
5. `Editing or deleting vehicle preserves snapshot on existing mileage records` — create mileage with vehicle (`B-77-OLD`, `6.0`), then PATCH vehicle plate to `B-77-NEW` and consumption to `10.0`, then DELETE vehicle; `GET /api/reports/{id}/mileage` and `GET /api/reports/{id}` still return `vehicle_plate == "B-77-OLD"`, `fuel_consumption_l_per_100km == 6.0`, and `vehicle_id == null`.

- [ ] **Step 2: Run test to verify new tests fail**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests MileageControllerTest --no-daemon`
Expected: FAIL on the new vehicle-linked tests.

- [ ] **Step 3: Update `MileageRecord`, DTOs, `MileageController`, and `ReportMapper`**

- `MileageRecord.kt`: add `@ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "vehicle_id") var vehicle: UserVehicle? = null`, plus `vehiclePlate: String? = null`, `vehicleMakeModel: String? = null`, `vehicleFuelType: String? = null`.
- `MileageRecordCreate.kt`: add `@JsonProperty("vehicle_id") val vehicleId: Int? = null`.
- `MileageRecordUpdate.kt`: add `@JsonProperty("vehicle_id") val vehicleId: Int? = null`, `@JsonProperty("clear_vehicle") val clearVehicle: Boolean = false`.
- `MileageRecordOut.kt`: add `@JsonProperty("vehicle_id") val vehicleId: Int? = null`, `@JsonProperty("vehicle_plate") val vehiclePlate: String? = null`, `@JsonProperty("vehicle_make_model") val vehicleMakeModel: String? = null`, `@JsonProperty("vehicle_fuel_type") val vehicleFuelType: String? = null`.
- `MileageController.kt`:
  - Inject `userVehicleRepository: UserVehicleRepository`.
  - Update `getCalculationSettings(fuelConsumptionOverride: BigDecimal? = null)` to use `fuelConsumptionOverride ?: setting("mileage_fuel_consumption_l_per_100km", "7.5")`.
  - In `createMileage`: if `body.vehicleId != null`, look up `userVehicleRepository.findByIdAndUserId(body.vehicleId, currentUser.id!!) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found")`; pass `vehicle?.fuelConsumptionLitersPer100Km` into `getCalculationSettings(...)`; save `vehicle` + snapshot fields.
  - In `updateMileage`: if `body.clearVehicle` or `body.vehicleId != null`, resolve new `vehicle` (or `null`), update `rec.vehicle` + snapshot fields, set `rec.fuelConsumptionLitersPer100Km = vehicle?.fuelConsumptionLitersPer100Km ?: setting("mileage_fuel_consumption_l_per_100km", "7.5")`, and include `vehicleChanged` in the recalculation trigger (`if (distanceChanged || dateChanged || vehicleChanged)`).
  - Map the 4 new fields in `MileageController.mapRecordToOut` and `ReportMapper.mapRecordToOut`.

- [ ] **Step 4: Run targeted backend tests**

Run: `cd backend-kotlin-jpa && ./gradlew test --tests MileageControllerTest --tests ReportControllerImportOrderTest --no-daemon`
Expected: PASS (all existing + new tests green).

- [ ] **Step 5: Commit Task 2**

```bash
git add backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/model/MileageRecord.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordCreate.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordUpdate.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/dto/report/MileageRecordOut.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/MileageController.kt \
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/mapper/ReportMapper.kt \
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/MileageControllerTest.kt
git commit -m "feat(backend): link user vehicles to mileage records with consumption override and snapshots"
```

---

### Task 3: Left Sidebar — Add `/profile` as First Item & Fix Active Highlight

**Files:**
- Modify: `frontend/components/layout/nav.ts:30-62`
- Modify: `frontend/components/layout/Sidebar.tsx:170-192`

**Interfaces:**
- Consumes: existing `nav.profile` i18n key (`"Profile"` / `"Profil"`) and `User` icon from `lucide-react`
- Produces: `/profile` as the first entry in `NAV` for all 4 roles, with exact active matching on `/profile`

- [ ] **Step 1: Update `frontend/components/layout/nav.ts`**

- Add `{ href: "/profile", labelKey: "profile", icon: User, roles: ["technician", "manager", "chef_finance", "mod"] }` as the **first** item in `NAV` (above `/dashboard`).
- Remove the duplicate `/profile` entry from `EXTRA_TITLE_ROUTES` (since `TITLE_ROUTES` already includes `NAV` and sorts longest-prefix first, `/profile/signature` still resolves to `"signature"` and `/profile` resolves to `"profile"`).

- [ ] **Step 2: Fix active-link matching in `frontend/components/layout/Sidebar.tsx`**

In the main `visibleNav` map (`Sidebar.tsx` around line 172), change:
```ts
const active = href === "/profile" ? pathname === "/profile" : pathname.startsWith(href);
```
so `/profile/signature` only highlights **Semnătură** and `/profile/[id]` (viewing another user) does not highlight the current user's **Profil**.

- [ ] **Step 3: Run frontend checks**

Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
Expected: Exit code 0, zero warnings or errors.

- [ ] **Step 4: Commit Task 3**

```bash
git add frontend/components/layout/nav.ts frontend/components/layout/Sidebar.tsx
git commit -m "feat(web): add Profile as first item in left sidebar"
```

---

### Task 4: Frontend Vehicles Management in `/profile` + Types, Query Keys & i18n

**Files:**
- Create: `frontend/lib/types/vehicle.ts`
- Modify: `frontend/lib/types/index.ts`
- Modify: `frontend/lib/queryKeys.ts`
- Create: `frontend/components/profile/VehiclesSection.tsx`
- Modify: `frontend/app/profile/page.tsx`
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ro.json`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/users/me/vehicles` from Task 1
- Produces:
  - `FuelType`, `UserVehicle`, `UserVehicleCreatePayload`, `UserVehicleUpdatePayload` in `frontend/lib/types/vehicle.ts` (re-exported from `frontend/lib/types/index.ts` and `@/lib/api`)
  - `vehicleKeys = { all: ["vehicles"] as const, me: () => [...vehicleKeys.all, "me"] as const }` in `frontend/lib/queryKeys.ts`
  - `<VehiclesSection />` component rendered inside `/profile`
  - i18n keys under `profile.*` and `reports.mileage_vehicle*` in both `en.json` and `ro.json`

- [ ] **Step 1: Add TypeScript types and query keys**

- Create `frontend/lib/types/vehicle.ts` with `FuelType = "petrol" | "diesel" | "hybrid" | "electric" | "lpg"`, `UserVehicle`, `UserVehicleCreatePayload`, `UserVehicleUpdatePayload`.
- Re-export `* from "./vehicle"` in `frontend/lib/types/index.ts`.
- Add `vehicleKeys` to `frontend/lib/queryKeys.ts`.

- [ ] **Step 2: Add i18n keys to `frontend/messages/en.json` and `frontend/messages/ro.json`**

Add matching keys in both files:
- Under `profile`: `vehicles_section`, `vehicles_subtitle`, `vehicles_empty`, `add_vehicle`, `edit_vehicle`, `plate_number`, `plate_placeholder`, `make_model`, `make_model_placeholder`, `fuel_type`, `fuel_type_none`, `fuel_petrol`, `fuel_diesel`, `fuel_hybrid`, `fuel_electric`, `fuel_lpg`, `fuel_consumption`, `fuel_consumption_hint`, `fuel_consumption_global_fallback`, `set_as_default`, `default_badge`, `vehicle_saved`, `vehicle_deleted`, `vehicle_save_failed`, `vehicle_delete_failed`, `vehicle_confirm_delete`, `vehicle_plate_required`, `vehicle_consumption_invalid`.
- Under `reports`: `mileage_vehicle`, `mileage_vehicle_none`, `mileage_vehicle_add_hint`, `mileage_vehicle_add_link`.

- [ ] **Step 3: Build `frontend/components/profile/VehiclesSection.tsx` and mount in `frontend/app/profile/page.tsx`**

- `VehiclesSection.tsx`:
  - Queries `GET /users/me/vehicles` with `vehicleKeys.me()`.
  - Displays each vehicle card with plate number, make/model, fuel type label, consumption (`X.X l/100km` or muted `"Standard (7.5 l/100km)"`), and Default badge.
  - Supports inline Add / Edit form (parses consumption with `parseLocaleNumber`, sends `clear_make_model` / `clear_fuel_type` / `clear_fuel_consumption` on `PATCH` when cleared), Set as default button, and Delete button with `window.confirm`.
  - Invalidates `vehicleKeys.me()` on all mutations.
- Mount `<VehiclesSection />` in `frontend/app/profile/page.tsx` between the Account Info section and the Password section.

- [ ] **Step 4: Run frontend checks**

Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
Expected: Exit code 0, zero warnings or errors.

- [ ] **Step 5: Commit Task 4**

```bash
git add frontend/lib/types/vehicle.ts frontend/lib/types/index.ts frontend/lib/queryKeys.ts \
  frontend/components/profile/VehiclesSection.tsx frontend/app/profile/page.tsx \
  frontend/messages/en.json frontend/messages/ro.json
git commit -m "feat(web): add vehicle management section to user profile"
```

---

### Task 5: Frontend Report Mileage Vehicle Selector & Display (`/reports/[id]/mileage`)

**Files:**
- Modify: `frontend/lib/types/report.ts:31-62`
- Modify: `frontend/app/reports/[id]/mileage/page.tsx`

**Interfaces:**
- Consumes: `UserVehicle` + `vehicleKeys.me()` from Task 4, `MileageRecord` vehicle snapshot fields from Task 2
- Produces: Optional vehicle dropdown (default vehicle auto-preselected) on `/reports/[id]/mileage` add-trip form + vehicle plate/model display on trip rows and cards

- [ ] **Step 1: Extend `MileageRecord` TypeScript interface in `frontend/lib/types/report.ts`**

Add nullable fields to `MileageRecord`:
- `vehicle_id: number | null;`
- `vehicle_plate: string | null;`
- `vehicle_make_model: string | null;`
- `vehicle_fuel_type: FuelType | null;`

- [ ] **Step 2: Wire vehicle selector & trip display in `frontend/app/reports/[id]/mileage/page.tsx`**

- Query `GET /users/me/vehicles` via `useQuery<UserVehicle[]>({ queryKey: vehicleKeys.me(), queryFn: ... })`.
- Add `selectedVehicleId` state (`string`, `""` means no vehicle / standard global consumption). When opening the Add Trip form (or once vehicles load while the form is open and user hasn't manually changed selection), default `selectedVehicleId` to the user's `is_default` vehicle's `id` (as string), if one exists.
- In the Add Trip form:
  - Render a `<select id="mileage-vehicle">` with `"Fără mașină (consum standard)"` + each vehicle formatted as `${v.plate_number}${v.make_model ? ` · ${v.make_model}` : ""}${v.fuel_consumption_l_per_100km != null ? ` (${v.fuel_consumption_l_per_100km} l/100km)` : ""}`.
  - If `vehicles.length === 0`, show a subtle inline hint with a `<Link href="/profile">` to add a vehicle in profile.
  - Include `...(selectedVehicleId ? { vehicle_id: Number(selectedVehicleId) } : {})` in the `POST /reports/${id}/mileage` mutation payload.
  - Reset `selectedVehicleId` back to the default vehicle on successful submit.
- In the trip list (both desktop table and mobile cards in `mileage/page.tsx`):
  - When `m.vehicle_plate` is present, render a clean badge/line showing `m.vehicle_plate` (and `m.vehicle_make_model` if present).

- [ ] **Step 3: Run frontend checks & verify full backend targeted suite**

Run:
```bash
cd frontend && npm run typecheck && npm run i18n:check && npm run lint
cd ../backend-kotlin-jpa && ./gradlew test --tests UserVehicleControllerTest --tests MileageControllerTest --no-daemon
```
Expected: Both commands exit 0 with all checks and tests passing.

- [ ] **Step 4: Commit Task 5**

```bash
git add frontend/lib/types/report.ts frontend/app/reports/[id]/mileage/page.tsx
git commit -m "feat(web): connect user vehicles to report mileage trips"
```

---

## Self-Review Check
- **Spec coverage:** Sidebar `/profile` first item + active fix (Task 3); `user_vehicles` + `mileage_records` migration + CRUD + default rules + validation (Task 1); Mileage linkage + per-vehicle consumption + fallback + immutable snapshots (Task 2); Profile UI + i18n (Task 4); Report mileage UI selector + default preselection + trip display (Task 5). No gaps.
- **Type consistency:** `FuelType`, `UserVehicle`, `vehicleKeys.me()`, `vehicle_id`, `vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`, `clear_vehicle`, `clear_fuel_consumption` match across all tasks.
- **Review Focus:** All 5 failure modes are explicitly pinned to tests in Tasks 1, 2, and 3.
