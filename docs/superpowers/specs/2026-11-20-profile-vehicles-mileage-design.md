# Design: Web Profile Access, User Vehicles & Report Mileage Linkage

**Date:** 2026-11-20  
**Status:** Approved  
**Scope:** Project (backend schema + API + mileage calculation integration + web UI)

---

## 1. Intent & Why

On desktop web, users currently have no way to navigate to their profile page (`/profile`) — it is only linked from the mobile bottom navigation and mobile top header. Meanwhile, the organization wants technicians to register their car(s) in their profile and link them to mileage trips (`km`) inside ExpenseReports.

This serves two connected goals:
1. **Immediate:** Give every web user one-click access to their profile from the top of the left sidebar, let them manage their vehicles (including per-vehicle fuel consumption), and connect those vehicles to mileage trips in reports.
2. **Foundational:** Establish clean, historically accurate vehicle-to-mileage data so a future **Foaie de parcurs** (trip log / road sheet) can be generated directly from an ExpenseReport's mileage records without retroactive data loss.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add **Profil** (`/profile`) as the **first item** in the left sidebar navigation on web for all roles (`technician`, `manager`, `chef_finance`, `mod`).
- Allow each user to manage a **list of vehicles** in `/profile`, with one vehicle marked as **default**.
- Store vehicle details needed for mileage calculation and future *foaie de parcurs*:
  - `plate_number` (required)
  - `make_model` (optional)
  - `fuel_type` (optional enum: `petrol`, `diesel`, `hybrid`, `electric`, `lpg`)
  - `fuel_consumption_l_per_100km` (optional decimal; falls back to global app setting `mileage_fuel_consumption_l_per_100km`, default `7.5`)
- Connect vehicles to `MileageRecord` in `/reports/[id]/mileage`:
  - Vehicle selection is **optional**, but the user's **default vehicle is preselected** automatically when adding a new trip.
  - When a vehicle with a configured consumption is selected, `MileageCalculationService` uses that vehicle's `fuel_consumption_l_per_100km`; otherwise it falls back to the global setting (`7.5 l/100km`).
  - Snapshot the selected vehicle's identifying fields on `MileageRecord` at save time so future vehicle edits or deletions never mutate historical reports.

### Non-Goals
- Generating the **Foaie de parcurs** PDF/export itself (explicitly a later phase).
- Odometer start/end fields (`km bord`) or company fleet pool sharing across multiple users.
- Changing how managers/admins view another user's profile (`/profile/[id]`).
- Changing the accounting rule that mileage is excluded from the PDF report reimbursement total (`CONTEXT.md`).

### Anti-Goals
- **Mutating historical reports:** Editing a car's plate number, model, or fuel consumption in `/profile`, or removing a car, must never alter previously recorded mileage trips or approved reports.
- **Blocking adoption:** Technicians who have not yet added a vehicle in `/profile` must still be able to log mileage trips using the global consumption fallback.
- **Double active sidebar highlight:** Visiting `/profile/signature` must not highlight both **Profil** and **Semnătură** in the left sidebar.

---

## 3. Approaches Considered

### Approach A — Dedicated `user_vehicles` table + nullable `vehicle_id` FK + snapshot columns on `mileage_records` *(Selected)*
- **Structure:** New `user_vehicles` table owned by `users(id)` with `/api/users/me/vehicles` endpoints. `mileage_records` adds a nullable `vehicle_id` FK (`ON DELETE SET NULL`) plus snapshot columns (`vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`), alongside the existing `fuel_consumption_l_per_100km` snapshot.
- **Trade-offs:** Adds three small snapshot columns to `mileage_records`, in exchange for complete historical immutability on approved reports and future *foaie de parcurs* exports — even if a technician edits or deletes a vehicle later.

### Approach B — Dedicated `user_vehicles` table with soft-delete, `vehicle_id` FK only (no snapshots)
- **Structure:** Same `user_vehicles` table, but `mileage_records` stores only `vehicle_id` and vehicles are soft-deleted (`is_active = false`).
- **Trade-offs:** Slightly fewer columns on `mileage_records`, but editing a vehicle's plate or model in `/profile` would retroactively change historical/approved reports.

### Approach C — JSON vehicle array on `users` table *(Eliminated)*
- **Why rejected:** Loses relational integrity and makes querying/grouping mileage records by vehicle awkward for future *foaie de parcurs* generation.

**Decision:** **Approach A** was selected by the user to protect historical report accuracy for future *foaie de parcurs* generation.

---

## 4. Detailed Design

### 4.1 Left Sidebar Navigation (`frontend/components/layout/nav.ts` & `Sidebar.tsx`)
- Move `{ href: "/profile", labelKey: "profile", icon: User, roles: ["technician", "manager", "chef_finance", "mod"] }` from `EXTRA_TITLE_ROUTES` to the **first position** of `NAV` (above `/dashboard`).
- Keep `/profile/signature` in its existing bottom section of `Sidebar.tsx`.
- Fix active-route matching in `Sidebar.tsx`: for `/profile`, match `pathname === "/profile"` (not `pathname.startsWith("/profile")`), so `/profile/signature` only highlights **Semnătură** and `/profile/[id]` (admin directory user view) does not falsely highlight the current user's **Profil**.

### 4.2 Database Migration (`V108__user_vehicles_and_mileage_link.sql`)
- Create `user_vehicles`:
  - `id SERIAL PRIMARY KEY`
  - `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `plate_number VARCHAR(32) NOT NULL`
  - `make_model VARCHAR(120)`
  - `fuel_type VARCHAR(20)` — allowed values (validated in backend): `petrol`, `diesel`, `hybrid`, `electric`, `lpg` (nullable)
  - `fuel_consumption_l_per_100km NUMERIC(5,2)` — nullable, must be `> 0` when provided
  - `is_default BOOLEAN NOT NULL DEFAULT FALSE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - Index on `(user_id)` and partial unique index `CREATE UNIQUE INDEX uq_user_vehicles_default ON user_vehicles(user_id) WHERE is_default = TRUE` to guarantee at most one default vehicle per user at the database level.
- Alter `mileage_records`:
  - `ADD COLUMN vehicle_id INTEGER REFERENCES user_vehicles(id) ON DELETE SET NULL`
  - `ADD COLUMN vehicle_plate VARCHAR(32)`
  - `ADD COLUMN vehicle_make_model VARCHAR(120)`
  - `ADD COLUMN vehicle_fuel_type VARCHAR(20)`
  - Index on `(vehicle_id)` for future *foaie de parcurs* queries.

### 4.3 Backend API & Business Logic

#### Vehicle Endpoints (`/api/users/me/vehicles`)
All endpoints require an authenticated `currentUser` and operate strictly on vehicles where `vehicle.user.id == currentUser.id` (return `404` if not found or owned by another user).

- `GET /api/users/me/vehicles` — returns current user's vehicles ordered by `is_default DESC, created_at ASC`.
- `POST /api/users/me/vehicles` — creates a vehicle.
  - Validates `plate_number` non-blank (trimmed, normalized to uppercase — *builder/designer call noted below*), `fuel_type` in allowed set if non-null, `fuel_consumption_l_per_100km > 0` and `<= 50` if non-null.
  - **Default rule (my call):** If this is the user's first vehicle, automatically set `is_default = true`. If `is_default = true` is requested on creation, clear `is_default` on the user's other vehicles in the same transaction before saving.
- `PATCH /api/users/me/vehicles/{id}` — updates vehicle fields (`plate_number`, `make_model`, `fuel_type`, `fuel_consumption_l_per_100km`, `is_default`).
  - If `is_default = true`, clear `is_default` on the user's other vehicles in the same transaction.
  - Allows clearing optional fields (`make_model`, `fuel_type`, `fuel_consumption_l_per_100km`) explicitly.
- `DELETE /api/users/me/vehicles/{id}` — hard-deletes the row (safe because `mileage_records.vehicle_id` has `ON DELETE SET NULL` and snapshots are preserved on `mileage_records`).
  - **Default fallback rule (my call):** If the deleted vehicle was `is_default = true` and the user still has other vehicles, promote the oldest remaining vehicle to `is_default = true` so the user doesn't lose auto-preselection unexpectedly.

#### Mileage Integration (`MileageController.kt`, `MileageRecord.kt`, `ReportMapper.kt`)
- `MileageRecordCreate`: add optional `@JsonProperty("vehicle_id") val vehicleId: Int? = null`.
- `MileageRecordUpdate`: add optional `@JsonProperty("vehicle_id") val vehicleId: Int? = null` plus `@JsonProperty("clear_vehicle") val clearVehicle: Boolean = false` (so a PATCH can cleanly distinguish "omitted / unchanged" from "explicitly unassign vehicle").
- `MileageRecordOut`: add `vehicle_id`, `vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type` (mapped in both `MileageController.mapRecordToOut` and `ReportMapper.mapRecordToOut`).
- On `createMileage`:
  - If `body.vehicleId != null`, load vehicle owned by `currentUser` (return `404` / `400` if not found or owned by another user).
  - Resolve `fuelConsumption`: `vehicle?.fuelConsumptionLitersPer100Km ?: globalSetting("mileage_fuel_consumption_l_per_100km", "7.5")`.
  - Pass resolved `fuelConsumption` into `MileageCalculationSettings` for `MileageCalculationService.calculate(...)`.
  - Persist `vehicle`, `vehiclePlate = vehicle?.plateNumber`, `vehicleMakeModel = vehicle?.makeModel`, `vehicleFuelType = vehicle?.fuelType`, and `fuelConsumptionLitersPer100Km = settings.fuelConsumption`.
- On `updateMileage`:
  - If `clearVehicle == true` or `body.vehicleId != null`: update vehicle reference + snapshot fields, update `rec.fuelConsumptionLitersPer100Km` to the new vehicle's consumption (or current global setting if cleared/null), and recalculate amounts/taxes using `recalculate(...)`.

### 4.4 Frontend UI

#### Profile Page (`frontend/app/profile/page.tsx`)
- Add a **"Mașinile mele" / "My Vehicles"** card section between Account Info and Password.
- Shows list of vehicles with:
  - Plate number (prominent), make/model, fuel type badge, consumption (`X.X l/100km` or muted label showing global fallback), and a **"Implicită" / "Default"** badge.
  - Actions per vehicle: **Set as default** (if not default), **Edit**, **Delete** (with confirmation).
  - **"+ Adaugă mașină" / "+ Add vehicle"** inline form (or modal/card toggle matching existing app styling) with inputs for Plate Number (required), Make & Model, Fuel Type select, Fuel Consumption (l/100km, optional, with helper text noting fallback to global default), and "Set as default" checkbox.

#### Report Mileage Page (`frontend/app/reports/[id]/mileage/page.tsx`)
- Fetch user's vehicles via `GET /api/users/me/vehicles` (React Query key `vehicleKeys.me`).
- In the Add Trip form (when `report.status === "draft"`):
  - Add a **Vehicle** `<select>` dropdown with options: `"Fără mașină (consum standard)"` + user's vehicles (`B-123-XYZ — Dacia Duster (6.5 l/100km)`).
  - Automatically preselect the user's `is_default` vehicle when opening the form (if the user has one).
  - If the user has no vehicles yet, show a subtle helper link to `/profile` ("Adaugă o mașină în profil") without blocking submission.
  - Send `vehicle_id` (when selected) in `POST /reports/${id}/mileage`.
- In the trip list (desktop table & mobile cards):
  - Display the trip's `vehicle_plate` (and `vehicle_make_model` if present) when set, alongside the already-recorded consumption/distance details.

#### Internationalization (`frontend/messages/en.json` & `frontend/messages/ro.json`)
- Add all new labels, fuel type names, placeholders, and error/confirmation strings to both `en.json` and `ro.json` so `npm run i18n:check` passes.

---

## 5. Calls Made by Designer (for User Review)

1. **Plate number normalization:** Trim whitespace and store uppercase (e.g. `b 123 xyz` → `B 123 XYZ`) for consistency on future *foaie de parcurs* documents.
2. **Auto-default behavior:** First added vehicle automatically becomes default; deleting the default vehicle automatically promotes the next remaining vehicle to default.
3. **Hard delete of `user_vehicles`:** Safe because `mileage_records` keeps `ON DELETE SET NULL` + snapshot columns (`vehicle_plate`, `vehicle_make_model`, `vehicle_fuel_type`, `fuel_consumption_l_per_100km`), keeping the vehicle list clean without orphaned soft-deleted rows.
4. **Clearing vehicle on `PATCH`:** Use `clear_vehicle: Boolean = false` on `MileageRecordUpdate` to unambiguously distinguish omitting `vehicle_id` from clearing it.
5. **Consumption validation:** When provided, `fuel_consumption_l_per_100km` must be `> 0` and `<= 50.0` (note: for `electric` vehicles, users can either leave consumption blank to use global fallback or enter an equivalent value if desired; we do not force a separate kWh unit in this phase).

---

## 6. Left to the Builder

- Exact Kotlin package/file layout for `UserVehicle` entity, repository, DTOs, and controller (following existing `eu.nt.xpenses.*` conventions).
- Exact Tailwind styling and responsive layout details for the Vehicles card in `/profile` and the vehicle badge/column in `/reports/[id]/mileage`.
- Query key structure in `frontend/lib/queryKeys.ts` and TypeScript interfaces in `frontend/lib/types/`.
- Unit/controller tests for `UserVehicleController` and `MileageController` (default switching, ownership isolation, per-vehicle consumption calculation, snapshot preservation after vehicle edit/delete).
