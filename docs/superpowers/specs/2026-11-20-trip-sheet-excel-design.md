# Design: Trip Sheet ("Foaie de parcurs") Excel Export from Report Mileage

**Date:** 2026-11-20  
**Status:** Approved  
**Scope:** Project (DB migration `V109`, backend Excel generator & API, frontend profile/mileage/report UI)

---

## 1. Intent & Why

Technicians currently maintain manual Excel files (e.g. `foaie de parcurs Heineken Hrvatska .xlsb`) for every trip with car mileage, duplicating the same dates, times, routes, distances, and vehicle info they already enter into Xpenses reports.

This feature replaces that manual Excel workflow completely: any `ExpenseReport` with mileage records can generate a ready-to-print / ready-to-submit `.xlsx` **Foaie de parcurs** matching the organization's exact layout, populated automatically from the technician's profile, vehicle snapshot, and mileage records.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add the 3 remaining data fields required by the real *Foaie de parcurs* template:
  1. **Vehicle category (`vehicle_category`)** on `user_vehicles` (default `"M1"`, editable, max 16 chars) + snapshot `vehicle_category` on `mileage_records`.
  2. **Round trip (`round_trip`)** boolean flag on `mileage_records` (default `false`) — informational marker (`x` in the Excel `Dus / Întors` column); does **not** double `distance_km`.
  3. **Starting odometer (`starting_odometer_km`)** on `expense_reports` (nullable `NUMERIC(10,1)`, `>= 0`) — single starting dashboard reading for the report, with optional auto-prefill from `user_vehicles.last_odometer_km` and automatic cumulative calculation across all trips and across months.
- Add `GET /api/reports/{reportId}/mileage/trip-sheet` returning an `.xlsx` file (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) built programmatically with Apache POI (`XSSFWorkbook`), accessible to anyone authorized to view the report (`authorization.canView`).
- Reproduce the organization's exact *Foaie de parcurs* layout:
  - Separate monthly worksheet tabs (e.g. `Aprilie`, `Mai`) when a report spans multiple months; if a report has trips for multiple distinct vehicles (or unassigned), separate tabs per `(Month, Vehicle)` (e.g. `Aprilie - GJ01POA`), keeping clean month names (`Aprilie`) when only one vehicle is used.
  - Exact header block (rows 4–8), 2-row merged table header (rows 10–11), dynamic trip rows (not capped at 20), live Excel formulas (`=J12+M12`, `=SUM(...)`, `=L5+L7`), and A4 Landscape print setup.
- Add **"Descarcă Foaie de parcurs (.xlsx)"** download button on both `/reports/[id]/mileage` and `/reports/[id]` (visible when the report has `>= 1` mileage record).
- Allow editing `starting_odometer_km` on `/reports/[id]/mileage` (when `report.status === "draft"`), with an optional one-click prefill from the default/selected vehicle's last known odometer.

### Non-Goals
- Generating `.xlsb` binary format (standard `.xlsx` opens identically in Excel/LibreOffice and is natively supported by Apache POI already in the repo).
- Doubling `distance_km` automatically when `round_trip` is checked (explicitly rejected by user to prevent accidental double-counting).
- Changing PDF report reimbursement totals (`CONTEXT.md` accounting policy remains unchanged).
- Bundling the trip sheet inside `receipts-zip` (can be added later if requested).

### Anti-Goals
- **Capping trips at 20 rows:** The manual template had 20 fixed rows; our generator must handle any number of trips cleanly without breaking formulas or merged `TOTAL` cells.
- **Retroactive mutation of historical reports:** `vehicle_category` is snapshotted onto `mileage_records` just like `vehicle_plate`, `vehicle_make_model`, and `vehicle_fuel_type`.
- **Excel formula injection:** User-supplied text fields (`origin`, `destination`, `description`, `displayName`, `plateNumber`, `makeModel`) must be sanitized against leading `=`, `+`, `-`, `@` characters before writing to cells.

---

## 3. Approaches Considered

### Approach A — Programmatic Apache POI (`XSSFWorkbook`) generator *(Selected)*
- **Structure:** Dedicated `TripSheetExportService` builds the workbook in Kotlin using the existing `org.apache.poi` dependency, creating dynamic sheets per month (and per vehicle if >1 vehicle in the report), live Excel formulas, merged headers, borders, and A4 landscape print settings.
- **Trade-offs:** ~200–250 lines of POI styling code, in exchange for unlimited row counts, dynamic multi-month/multi-vehicle sheets, zero fragile binary templates in Git, and clean unit testing directly with POI.

### Approach B — Clone & patch a static `.xlsx` template resource
- **Structure:** Convert the `.xlsb` to `.xlsx`, embed in `src/main/resources/`, clone sheets per month, and overwrite cells.
- **Trade-offs:** Preserves exact original formatting without POI style code, but inserting rows beyond 20 in POI frequently breaks merged regions (`L32:M32`) and formula references, and binary template files are hard to diff/maintain.

**Decision:** **Approach A** was selected by the user.

---

## 4. Detailed Design

### 4.1 Database Migration (`V109__trip_sheet_fields.sql`)
- `ALTER TABLE user_vehicles`:
  - `ADD COLUMN vehicle_category VARCHAR(16) NOT NULL DEFAULT 'M1'`
  - `ADD COLUMN last_odometer_km NUMERIC(10,1)`
- `ALTER TABLE expense_reports`:
  - `ADD COLUMN starting_odometer_km NUMERIC(10,1)`
- `ALTER TABLE mileage_records`:
  - `ADD COLUMN round_trip BOOLEAN NOT NULL DEFAULT FALSE`
  - `ADD COLUMN vehicle_category VARCHAR(16)`

### 4.2 Backend API & Domain Updates

1. **Vehicles (`/api/users/me/vehicles`):**
   - Extend `UserVehicle`, `UserVehicleCreate`, `UserVehicleUpdate`, `UserVehicleOut` with `vehicle_category` (default `"M1"`, trimmed uppercase, max 16 chars) and `last_odometer_km` (optional `BigDecimal >= 0`, 1 decimal place).
2. **Reports (`PATCH /api/reports/{id}` & `ReportOut`):**
   - Extend `ExpenseReport`, `ReportUpdate`, and `ReportOut` (via `ReportMapper`) with `starting_odometer_km` (`BigDecimal?`, validated `>= 0` when provided, plus `clear_starting_odometer: Boolean = false` on `ReportUpdate` so it can be cleared explicitly).
   - **Auto-update `last_odometer_km` (my call):** When a report with `starting_odometer_km != null` and mileage records linked to a single vehicle is **submitted** (`POST /api/reports/{id}/submit`) or when `starting_odometer_km` is saved, we do NOT silently overwrite `last_odometer_km` on draft edits — instead, on `POST /api/reports/{id}/submit`, if `starting_odometer_km != null`, update the linked vehicle's `last_odometer_km` to `starting_odometer_km + totalVehicleKm` (only if the new value is greater than the existing `last_odometer_km` or existing is null), so the next report automatically suggests the right starting odometer!
3. **Mileage (`MileageController` & `MileageRecord`):**
   - Extend `MileageRecord`, `MileageRecordCreate`, `MileageRecordUpdate`, `MileageRecordOut`, and `ReportMapper` with `round_trip: Boolean = false` and `vehicle_category: String? = null` (snapshotted from `vehicle.vehicleCategory` on create/update).
4. **Trip Sheet Export Endpoint (`GET /api/reports/{reportId}/mileage/trip-sheet`):**
   - Auth: requires `currentUser` and `authorization.canView(currentUser, report.user?.id)`.
   - Returns `400 Bad Request` if the report has no mileage records (`"Report has no mileage records"`).
   - Calls `TripSheetExportService.buildTripSheet(report, records)`.
   - Response headers:
     - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
     - `Content-Disposition: attachment; filename="foaie_parcurs_raport_{reportId}_{yyyy-MM-dd}.xlsx"`

### 4.3 Excel Workbook Layout (`TripSheetExportService`)

Timezone for displaying dates/times and grouping trips by month: **`Europe/Bucharest`** (my call — matches Romanian organization & existing BNR/RO reporting conventions).

**Sheet grouping:**
- Sort trips chronologically by `startTime ASC, id ASC`.
- Group by `(vehicleGroupKey, YearMonth)` where `vehicleGroupKey` is `vehiclePlate ?: "UNASSIGNED"` (preserving order of first appearance).
- Sheet naming:
  - If all trips belong to a single vehicle group: Romanian month name (`Ianuarie`, `Februarie`, ..., `Decembrie`; append year if report spans multiple years, e.g. `Decembrie 2026`).
  - If multiple vehicle groups exist: `<Luna> - <Plate>` (sanitized to Excel's 31-char sheet name limit and stripped of invalid chars `: \ / ? * [ ]`).
- **Cumulative odometer across months (same vehicle):**
  - **Primary vehicle rule (my call):** `report.starting_odometer_km` applies to the primary vehicle group (the vehicle of the earliest trip chronologically in the report). If a report contains a second distinct vehicle, that secondary vehicle's tab leaves odometer cells blank while still computing `Total kilometri` (`L7`) and trip distances (`L12..`).
  - If `report.starting_odometer_km` is `null`, odometer cells (`L5`, `L6`, `J12..`, `K12..`, `K{total}`) remain blank while `Total kilometri` (`L7`) and `L12..` still compute distance cleanly.
  - Each subsequent month sheet for the primary vehicle starts automatically at the previous month's ending odometer (`runningOdometer` carried over).

**Exact 12-Column Cell Mapping (`A–L`, 1-indexed Excel rows):**
- **Row 1 (`A1:L1` merged, bold 12pt left):** `companyName` (injected via `@Value("\${company.name:Newtech Automation}")`, matching `PdfService.kt`).
- **Row 2 (`A2:L2` merged, 10pt muted/italic left):** `Raport: <report.title>` (appending ` · <report.kundenauftrag>` when present).
- **Row 3:** Blank spacer row.
- **Row 4 (`A4:L4` merged, bold 14pt centered):** `Foaie de parcurs pentru autovehicule`
- **Row 5:** `A5:B5` merged `"Luna"` | `C5:E5` merged `"<LUNA UPPERCASE>"` (e.g. `APRILIE`) | `F5` `"Auto"` | `G5:H5` merged `"<make_model> - <plate>"` (or plate only if no make_model) | `I5:K5` merged `"Kilometraj la plecare"` | `L5: <startingOdometer>` (numeric `#,##0.0`, or blank if unset)
- **Row 6:** `A6:B6` merged `"Șofer"` | `C6:E6` merged `"<driver displayName>"` | `F6` `"Categorie auto"` | `G6:H6` merged `"<vehicle_category or M1>"` | `I6:K6` merged `"Kilometraj la sosire"` | `L6: =L5+L7` (if `L5` set, else blank)
- **Row 7:** `F7` `"Tip combustibil"` | `G7:H7` merged `"<Romanian fuel label>"` (`Benzină` / `Diesel` / `Hibrid` / `Electric` / `GPL`, or `-`) | `I7:K7` merged `"Total kilometri"` | `L7: =SUM(L12:L{lastRow})`
- **Row 8:** `F8` `"Norma proprie de consum"` | `G8:H8` merged `"<consumption/100 formatted with comma> (L/km)"` (e.g. `0,08 (L/km)` for `8.0 l/100km`, using trip's `fuelConsumptionLitersPer100Km` snapshot)
- **Row 9:** Blank spacer row.
- **Row 10–11 (2-row table header, bordered, shaded, bold, centered):**
  - `A10:A11` merged: `Nr. Crt.`
  - `B10:C10` merged: `La plecare` → `B11: Ora`, `C11: Data`
  - `D10:E10` merged: `La sosire` → `D11: Ora`, `E11: Data`
  - `F10:I10` merged: `Ruta` → `F11: Plecat de la`, `G11: Sosit la`, `H11: Scop`, `I11: Dus / Întors`
  - `J10:L10` merged: `Kilometraj` → `J11: La plecare`, `K11: La sosire`, `L11: Nr. Km. parcurși`
- **Rows `12 .. 11+N` (one row per trip):**
  - `A`: `1..N`
  - `B`: start time (`HH:mm`, `Europe/Bucharest`)
  - `C`: start date (`dd.MM.yyyy`, `Europe/Bucharest`)
  - `D`: end time (`HH:mm`, `Europe/Bucharest`)
  - `E`: end date (`dd.MM.yyyy`, `Europe/Bucharest`)
  - `F`: `origin` (sanitized)
  - `G`: `destination` (sanitized)
  - `H`: `description` (sanitized, blank if null)
  - `I`: `"x"` if `roundTrip == true`, else `""`
  - `J`: start odometer (`=L5` on row 12, `=K{r-1}` on subsequent rows; blank if `L5` unset)
  - `K`: end odometer (`=J{r}+L{r}`; blank if `L5` unset)
  - `L`: numeric `distanceKm` (`0.0`)
- **Total Row (`12+N`):**
  - `B`: `"TOTAL"` (bold)
  - `K`: `=L6` (if odometer set, else blank)
  - `L`: `=SUM(L12:L{lastRow})` (bold, `0.0`)
- **Signature Footer (`14+N` and `15+N`):**
  - Row `14+N`: `B..E` merged `"Șofer: <driver displayName>"` (bold); `H..L` merged `"Aprobat: <approvedBy/signer displayName if available>"` (bold)
  - Row `15+N`: `B..E` merged `"Semnătură: ________________________"`; `H..L` merged `"Semnătură: ________________________"`
- **Print setup:** A4 Landscape, fit to 1 page wide (`fitWidth = 1, fitHeight = 0`).

### 4.4 Frontend UI
1. **Profile Vehicles (`VehiclesSection.tsx`):**
   - Add **Categorie auto** input/select (`M1` default, with quick options `M1`, `N1`, or custom) and optional **Ultimul kilometraj (km)** display/edit field.
2. **Report Mileage (`/reports/[id]/mileage/page.tsx`):**
   - Add **"Descarcă Foaie de parcurs (.xlsx)"** button in header when `records.length > 0` (triggers authenticated blob download from `/api/reports/${id}/mileage/trip-sheet`).
   - Add compact **Kilometraj la plecare (bord)** bar above the trips list (editable while `report.status === "draft"`, read-only summary when submitted/approved/paid; if unset and default/selected vehicle has `last_odometer_km`, show a one-click prefill chip e.g. `Folosește 376031,5 km`).
   - Add **"Dus / Întors"** checkbox in the Add Trip form (`round_trip`, default unchecked) and show a small badge (`Dus / Întors`) on trips where `round_trip === true`.
3. **Report Detail (`/reports/[id]/ReportDetailClient.tsx`):**
   - Add **"Foaie de parcurs (.xlsx)"** export button alongside the existing export buttons whenever `(report.mileage_records?.length ?? 0) > 0`.
4. **i18n (`en.json` & `ro.json`):**
   - Add all new labels/buttons/placeholders in both locales with full parity.

---

## 5. Calls Made by Designer (for User Review)

1. **Primary vehicle rule on multi-vehicle reports:** `report.starting_odometer_km` applies to the primary vehicle group (the vehicle of the earliest trip chronologically); if a report has a second vehicle, its tab leaves odometer cells blank while still computing `Total kilometri`.
2. **Timezone `Europe/Bucharest`:** Used for formatting `Ora`/`Data` and grouping trips into monthly tabs.
3. **Updating `vehicle.last_odometer_km` on report submission:** Automatically advances the vehicle's `last_odometer_km` when a report with `starting_odometer_km` is submitted (only if greater than the stored value), so the next report pre-suggests the right starting odometer without clobbering it during draft edits.
4. **Company header & signature block:** Uses existing `${company.name:Newtech Automation}` (same as `PdfService.kt`) in Row 1, report title/order number in Row 2, and `Șofer` / `Aprobat` signature lines 2 rows below `TOTAL`.
5. **Output format `.xlsx`:** Standard Excel format via Apache POI (already in backend); opens natively in Microsoft Excel, LibreOffice, and Google Sheets without macro warnings.

---

## 6. Left to the Builder

- Exact Kotlin package/class layout for `TripSheetExportService` and unit tests verifying generated workbook structure, formulas, multi-month odometer continuation, and formula-injection sanitization.
- Exact Tailwind styling for the odometer bar and download button in `/reports/[id]/mileage` and `/reports/[id]`.
- Exact error handling and loading state on the blob download button.
