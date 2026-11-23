# Mileage & Vehicles

## Overview
Consolidated deep module in `eu.nt.xpenses.mileage` owning `MileageRecord` CRUD and fuel/FX recalculation, `Vehicle` lifecycle and default-vehicle locking, `Trip sheet` XLSX export, and odometer validation/advancement.

## Interface
- `[VehicleMileage.kt:VehicleMileage]` — `@Service` entrypoint exposing `listMileage`, `exportTripSheet`, `createMileage`, `updateMileage`, `deleteMileage`, `listVehicles`, `createVehicle`, `updateVehicle`, `deleteVehicle`, `validateAndNormalizeOdometerKm`, and `advancePrimaryVehicleOdometer`
- `[MileagePricingPorts.kt:MileageFxRatePort]` / `[MileagePricingPorts.kt:FxServiceMileageAdapter]` — FX rate lookup port and Spring `@Component` adapter delegating to `FxService.getRate`
- `[MileagePricingPorts.kt:MileageFuelPricePort]` / `[MileagePricingPorts.kt:FuelPriceServiceMileageAdapter]` — daily fuel price lookup port and Spring `@Component` adapter delegating to `FuelPriceService.resolveFuelPrice`
- `[MileagePricingPorts.kt:MileageRatesConfigPort]` / `[MileagePricingPorts.kt:MileageRatesConfig]` / `[MileagePricingPorts.kt:AppSettingsMileageRatesAdapter]` — mileage configuration port and Spring `@Component` adapter delegating to `AppSettingsService.getMileageRates`
- `[MileageRecordMapper.kt:toMileageRecordOut]` / `[MileageRecordMapper.kt:TripSheetDownload]` — canonical `MileageRecord` -> `MileageRecordOut` projection and trip-sheet filename/bytes payload
- Internal collaborators: `[MileageCalculator.kt:MileageCalculator]` (`MileageCalculationSettings`, `MileageCalculation`) and `[TripSheetExporter.kt:TripSheetExporter]` (`buildTripSheet`)

## Invariants
- `[VehicleMileage.kt:VehicleMileage]` — mileage mutations (`createMileage`, `updateMileage`) run in three phases via `TransactionTemplate` (`readTx` -> out-of-transaction external FX/fuel lookups -> `writeTx`) to avoid holding DB connections across HTTP calls; `writeTx` and `deleteMileage` unconditionally acquire `acquireUserLock(actorId)` (`pg_advisory_xact_lock`) before `ExpenseReportRepository.findByIdForUpdate(reportId)` (`PESSIMISTIC_WRITE`), enforce report ownership (`403`), `draft` status (`400`), bounded finite `distanceKm` (`0.01..100000.0`), trimmed non-blank `origin`/`destination` (`<= 255`), blank-string `description` clearing (`""` -> `null`, `<= 1000`), UTC timestamp window (`2020-01-01`..`now + 1 year`, only on newly supplied timestamps on update), `endTime > startTime` (`422`), optimistic-lock `version` (`409` on mismatch), and `saveAndFlush(rec)` so `@Version` increments before response serialization; `updateMileage` computes semantic deltas (`distanceChanged`, `dateChanged` in `ZoneOffset.UTC`, `vehicleChanged`), reuses persisted `fuelExchangeRate` on same-date edits, protects legacy pre-V32 rows (`!hasModernFuelFields`) from modern fuel column writes, and returns a sanitized `502` on FX failures
- `[VehicleMileage.kt:VehicleMileage]` — vehicle mutations serialize per-user via `pg_advisory_xact_lock` (`acquireUserLock`) and maintain at most/at least one default vehicle when any exist (promoting oldest remaining on delete, rejecting direct `isDefault = false` on active default); vehicle validation enforces `plate_number <= 32` uppercase trimmed, `make_model <= 120`, `fuel_type` in `{petrol, diesel, hybrid, electric, lpg}`, `fuel_consumption_l_per_100km` in `0.01..50.00` (scale `<= 2`), `vehicle_category <= 16` uppercase (default `M1` on create), and `last_odometer_km`/`starting_odometer_km` in `0.0..9999999.9` (scale `<= 1`); `advancePrimaryVehicleOdometer` advances only the earliest trip's primary vehicle monotonically without regressing and logs outcomes/skip reasons
- `[MileageCalculator.kt:MileageCalculator.calculate]` — clamps negative taxable/net totals to zero and requires `fuelExchangeRate > 0`
- `[TripSheetExporter.kt:TripSheetExporter.buildTripSheet]` — sanitizes formula-injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) and carries primary-vehicle starting odometer across monthly sheets

## Side Effects
- `[VehicleMileage.kt:VehicleMileage]` — reads and mutates `mileage_records` and `user_vehicles` (preserving vehicle snapshots via `ON DELETE SET NULL`), acquires PostgreSQL advisory and `PESSIMISTIC_WRITE` report locks, queries FX/fuel/settings ports, emits structured SLF4J `INFO`/`WARN` audit logs, and generates Apache POI XLSX workbooks

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.mileage.VehicleMileageTest' --tests 'eu.nt.xpenses.mileage.TripSheetExporterTest' --no-daemon`
