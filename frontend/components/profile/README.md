# Profile Components

## Overview
User profile management components, providing CRUD management for personal vehicles (plate number, make/model, category, fuel type, fuel consumption, last odometer, and default vehicle selection).

## Interface
- `[VehiclesSection.tsx:VehiclesSection]` — Default-exported client component (`"use client"`) `VehiclesSection(): JSX.Element` rendering the user vehicles management section (add/edit form and vehicles list) with no props.

## Invariants
- `[VehiclesSection.tsx:handleSubmit]` & `[VehiclesSection.tsx:VehiclesSection]`: Trimmed `plateNumber` must be non-empty on submit (setting `formError` to `t("vehicle_plate_required")`), and the input enforces `required` and `maxLength={32}`.
- `[VehiclesSection.tsx:handleSubmit]`: When non-empty after trim, `fuelConsumption` must match `/^\d+([.,]\d{1,2})?$/` and parse via `parseLocaleNumber` to a finite number in `[0.01, 50]`.
- `[VehiclesSection.tsx:handleSubmit]`: When non-empty after trim, `lastOdometer` must match `/^\d+([.,]\d)?$/` and parse via `parseLocaleNumber` to a finite number in `[0, 9999999.9]`.
- `[VehiclesSection.tsx:VEHICLE_CATEGORIES]` & `[VehiclesSection.tsx:handleSubmit]`: `vehicleCategory` defaults to `"M1"`, input enforces `maxLength={16}` with datalist suggestions `["M1", "N1", "M2", "N2"]`, and submit normalizes via `vehicleCategory.trim().toUpperCase() || "M1"`.
- `[VehiclesSection.tsx:VehiclesSection]`: `makeModel` input enforces `maxLength={120}`, and `fuelType` is restricted to `""` or `FUEL_TYPES` (`["petrol", "diesel", "hybrid", "electric", "lpg"]`).
- `[VehiclesSection.tsx:handleSubmit]`: On edit submit, empty optional fields send explicit clear flags (`clear_make_model`, `clear_fuel_type`, `clear_fuel_consumption`, `clear_last_odometer` set to `true`) rather than `null`; on create submit, empty optional fields send `null`.
- `[VehiclesSection.tsx:openAddForm]`: Initializes `isDefault` to `vehicles.length === 0`.
- `[VehiclesSection.tsx:VehiclesSection]`: When editing a vehicle with `is_default === true`, the `is_default` checkbox is disabled; in the vehicle list, the set-default button is only rendered when `!vehicle.is_default`.
- `[VehiclesSection.tsx:VehiclesSection]`: Save and Cancel buttons are disabled while `isSaving` (`createMutation.isPending || updateMutation.isPending`); set-default and delete buttons are disabled while `setDefaultMutation.isPending` and `deleteMutation.isPending` respectively.
- `[VehiclesSection.tsx:handleDelete]` & `[VehiclesSection.tsx:deleteMutation]`: Deleting a vehicle requires `window.confirm(t("vehicle_confirm_delete"))` to return `true`; if the deleted vehicle matches `editingVehicle?.id`, `resetForm()` closes and resets the form.

## Side Effects
- `[VehiclesSection.tsx:VehiclesSection]`: Fetches vehicles via `api.get<UserVehicle[]>("/users/me/vehicles")` using TanStack Query key `vehicleKeys.me()`.
- `[VehiclesSection.tsx:createMutation]`, `[VehiclesSection.tsx:updateMutation]`, `[VehiclesSection.tsx:setDefaultMutation]`, `[VehiclesSection.tsx:deleteMutation]`: Execute `POST /users/me/vehicles`, `PATCH /users/me/vehicles/${id}`, and `DELETE /users/me/vehicles/${id}`, invalidating `vehicleKeys.me()` on success and updating `statusMsg`/`errorMsg`/`formError` state.
- `[VehiclesSection.tsx:handleDelete]`: Prompts the user with `window.confirm(t("vehicle_confirm_delete"))` before invoking `deleteMutation.mutate`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
