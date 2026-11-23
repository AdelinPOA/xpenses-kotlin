import type { MileageRecord, MileageUpdatePayload } from "./types/report";
import type { UserVehicle } from "./types/vehicle";

export type VehicleChoice =
  | { kind: "keep_snapshot" }
  | { kind: "vehicle"; vehicleId: number }
  | { kind: "none" };

export type VehicleSnapshotDrift = "matched" | "drifted" | "deleted" | "none";

export interface MileageDraftValues {
  origin: string;
  destination: string;
  startTime: string;
  endTime: string;
  distanceKm: string;
  description: string;
  roundTrip: boolean;
}

export interface TripDurationPreview {
  durationMinutes: number;
  formatted: string;
  dayOffset: number;
}

const STRICT_DECIMAL_PATTERN = /^\d+([.,]\d+)?$/;
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MIN_DISTANCE_KM = 0.01;
const MAX_DISTANCE_KM = 100_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateTimeLocal(value: string): Date | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

function formatDateTimeLocal(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Parse a locale decimal string (`.` or `,`), enforcing finite bounds `0.01 <= km <= 100000`. */
export function parseStrictDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!STRICT_DECIMAL_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < MIN_DISTANCE_KM || value > MAX_DISTANCE_KM) {
    return null;
  }
  return value;
}

/** Format a distance in km with 1 decimal minimum, showing 2 decimals when hundredths are non-zero. */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return "0.0";
  const roundedCents = Math.round(km * 100);
  if (roundedCents % 10 === 0) {
    return (roundedCents / 100).toFixed(1);
  }
  return (roundedCents / 100).toFixed(2);
}

/** Convert an ISO timestamp string to local `YYYY-MM-DDTHH:mm` for `datetime-local` inputs. */
export function isoToDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return formatDateTimeLocal(date);
}

/** Shift `prevEndLocal` to preserve duration when `start_time` changes; returns `prevEndLocal` if invalid or non-positive. */
export function shiftEndTimeForStartChange(
  prevStartLocal: string,
  prevEndLocal: string,
  nextStartLocal: string,
): string {
  const prevStart = parseDateTimeLocal(prevStartLocal);
  const prevEnd = parseDateTimeLocal(prevEndLocal);
  const nextStart = parseDateTimeLocal(nextStartLocal);
  if (!prevStart || !prevEnd || !nextStart) return prevEndLocal;
  const durationMs = prevEnd.getTime() - prevStart.getTime();
  if (durationMs <= 0) return prevEndLocal;
  return formatDateTimeLocal(new Date(nextStart.getTime() + durationMs));
}

/** Compute live trip duration minutes, formatted string (`Xh YYm`), and local day offset for `datetime-local` values. */
export function computeTripDurationPreview(
  startLocal: string,
  endLocal: string,
): TripDurationPreview | null {
  const start = parseDateTimeLocal(startLocal);
  const end = parseDateTimeLocal(endLocal);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return null;

  const durationMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const startUtcDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtcDay = Date.UTC(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );
  const dayOffset = Math.round((endUtcDay - startUtcDay) / MS_PER_DAY);

  return {
    durationMinutes,
    formatted: `${hours}h ${pad2(mins)}m`,
    dayOffset,
  };
}

/** Compare a trip's saved vehicle snapshot against the Technician's active vehicles list. */
export function detectVehicleSnapshotDrift(
  trip: Pick<
    MileageRecord,
    | "vehicle_id"
    | "vehicle_plate"
    | "vehicle_make_model"
    | "vehicle_fuel_type"
    | "vehicle_category"
    | "fuel_consumption_l_per_100km"
  >,
  vehicles: readonly Pick<
    UserVehicle,
    | "id"
    | "plate_number"
    | "make_model"
    | "fuel_type"
    | "vehicle_category"
    | "fuel_consumption_l_per_100km"
  >[],
): VehicleSnapshotDrift {
  const hasSnapshot =
    trip.vehicle_plate != null ||
    trip.vehicle_make_model != null ||
    trip.vehicle_fuel_type != null ||
    trip.vehicle_category != null;

  if (trip.vehicle_id == null) {
    return hasSnapshot ? "deleted" : "none";
  }

  const active = vehicles.find((v) => v.id === trip.vehicle_id);
  if (!active) return "deleted";

  const plateDiff =
    (trip.vehicle_plate ?? "").trim().toUpperCase() !==
    (active.plate_number ?? "").trim().toUpperCase();
  const makeModelDiff =
    (trip.vehicle_make_model ?? "").trim() !== (active.make_model ?? "").trim();
  const fuelTypeDiff =
    (trip.vehicle_fuel_type ?? "").trim().toLowerCase() !==
    (active.fuel_type ?? "").trim().toLowerCase();
  const categoryDiff =
    trip.vehicle_category != null &&
    trip.vehicle_category.trim().toUpperCase() !==
      (active.vehicle_category ?? "").trim().toUpperCase();
  const consumptionDiff =
    trip.fuel_consumption_l_per_100km != null &&
    active.fuel_consumption_l_per_100km != null &&
    Math.round(Number(trip.fuel_consumption_l_per_100km) * 100) !==
      Math.round(Number(active.fuel_consumption_l_per_100km) * 100);

  if (
    plateDiff ||
    makeModelDiff ||
    fuelTypeDiff ||
    categoryDiff ||
    consumptionDiff
  ) {
    return "drifted";
  }
  return "matched";
}

function sameVehicleChoice(a: VehicleChoice, b: VehicleChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "vehicle" && b.kind === "vehicle") {
    return a.vehicleId === b.vehicleId;
  }
  return true;
}

/** Build a sparse PATCH payload containing only changed fields, or `null` when nothing changed. */
export function buildMileagePatchPayload(
  original: Pick<
    MileageRecord,
    | "origin"
    | "destination"
    | "start_time"
    | "end_time"
    | "distance_km"
    | "description"
    | "round_trip"
    | "version"
  >,
  draft: MileageDraftValues,
  vehicleChoice: VehicleChoice,
  initialVehicleChoice: VehicleChoice,
): MileageUpdatePayload | null {
  const patch: MileageUpdatePayload = {};
  let changed = false;

  const trimmedOrigin = draft.origin.trim();
  if (trimmedOrigin !== original.origin.trim()) {
    patch.origin = trimmedOrigin;
    changed = true;
  }

  const trimmedDestination = draft.destination.trim();
  if (trimmedDestination !== original.destination.trim()) {
    patch.destination = trimmedDestination;
    changed = true;
  }

  const origStartLocal = isoToDateTimeLocal(original.start_time);
  if (draft.startTime !== origStartLocal) {
    const parsedStart = parseDateTimeLocal(draft.startTime);
    if (parsedStart) {
      patch.start_time = parsedStart.toISOString();
      changed = true;
    }
  }

  const origEndLocal = isoToDateTimeLocal(original.end_time);
  if (draft.endTime !== origEndLocal) {
    const parsedEnd = parseDateTimeLocal(draft.endTime);
    if (parsedEnd) {
      patch.end_time = parsedEnd.toISOString();
      changed = true;
    }
  }

  const parsedDistance = parseStrictDecimal(draft.distanceKm);
  if (
    parsedDistance !== null &&
    Math.abs(parsedDistance - original.distance_km) > 1e-9
  ) {
    patch.distance_km = parsedDistance;
    changed = true;
  }

  const origDesc = (original.description ?? "").trim();
  const nextDesc = draft.description.trim();
  if (nextDesc !== origDesc) {
    patch.description = nextDesc;
    changed = true;
  }

  if (draft.roundTrip !== original.round_trip) {
    patch.round_trip = draft.roundTrip;
    changed = true;
  }

  if (!sameVehicleChoice(vehicleChoice, initialVehicleChoice)) {
    if (vehicleChoice.kind === "vehicle") {
      patch.vehicle_id = vehicleChoice.vehicleId;
      changed = true;
    } else if (vehicleChoice.kind === "none") {
      patch.clear_vehicle = true;
      changed = true;
    }
  }

  if (!changed) return null;

  if (original.version != null) {
    patch.version = original.version;
  }

  return patch;
}
