# Vehicle DTOs

## Overview
Request and response data transfer objects for user vehicle registration, partial updates, and API serialization in `eu.nt.xpenses.dto.vehicle`.

## Interface
- `[UserVehicleDtos.kt:UserVehicleCreate]` — `data class` request DTO with `@JsonProperty` snake_case bindings (`plate_number`, `make_model`, `fuel_type`, `fuel_consumption_l_per_100km`, `vehicle_category`, `last_odometer_km`, `is_default`)
- `[UserVehicleDtos.kt:UserVehicleUpdate]` — `data class` partial-update DTO with nullable update fields and boolean clear flags (`clearMakeModel`, `clearFuelType`, `clearFuelConsumption`, `clearLastOdometer`)
- `[UserVehicleDtos.kt:UserVehicleOut]` — `data class` response DTO exposing persisted vehicle fields (`id`, `plateNumber`, `makeModel`, `fuelType`, `fuelConsumptionLitersPer100Km`, `vehicleCategory`, `lastOdometerKm`, `isDefault`, `createdAt`, `updatedAt`)
- `[UserVehicleDtos.kt:UserVehicleOut.Companion.from]` — `fun from(vehicle: UserVehicle): UserVehicleOut` converting a `UserVehicle` entity into `UserVehicleOut`

## Invariants
- `[UserVehicleDtos.kt:UserVehicleOut.Companion.from]` — requires `vehicle.id` to be non-null; throws `IllegalStateException("UserVehicle must be persisted")` if `id` is null

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --no-daemon`
