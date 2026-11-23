"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Car, Loader2, Pencil, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  MileageCreatePayload,
  MileageRecord,
  MileageUpdatePayload,
  UserVehicle,
} from "@/lib/api";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  buildDefaultDateTimeLocal,
  toLocalDateKey,
} from "@/lib/mileageWeeks";
import {
  buildMileagePatchPayload,
  computeTripDurationPreview,
  detectVehicleSnapshotDrift,
  isoToDateTimeLocal,
  parseStrictDecimal,
  shiftEndTimeForStartChange,
  type MileageDraftValues,
  type VehicleChoice,
} from "@/lib/mileageTripForm";

export interface MileageTripModalProps {
  mode: "create" | "edit";
  initialDateKey?: string;
  trip?: MileageRecord;
  vehicles: UserVehicle[];
  vehiclesLoading: boolean;
  vehiclesError: boolean;
  isPending: boolean;
  onClose: () => void;
  onCreate: (payload: MileageCreatePayload) => Promise<void>;
  onUpdate: (mileageId: number, payload: MileageUpdatePayload) => Promise<void>;
}

const KEEP_SNAPSHOT_VALUE = "__keep_snapshot__";

function vehicleChoiceToSelectValue(choice: VehicleChoice): string {
  if (choice.kind === "keep_snapshot") return KEEP_SNAPSHOT_VALUE;
  if (choice.kind === "vehicle") return String(choice.vehicleId);
  return "";
}

function selectValueToVehicleChoice(value: string): VehicleChoice {
  if (value === KEEP_SNAPSHOT_VALUE) return { kind: "keep_snapshot" };
  if (value === "") return { kind: "none" };
  return { kind: "vehicle", vehicleId: Number(value) };
}

function sameVehicleChoice(a: VehicleChoice, b: VehicleChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "vehicle" && b.kind === "vehicle") {
    return a.vehicleId === b.vehicleId;
  }
  return true;
}

function formatSavedSnapshotLabel(
  trip: MileageRecord,
  savedSuffix: string,
): string {
  const parts: string[] = [];
  if (trip.vehicle_plate) parts.push(trip.vehicle_plate);
  if (trip.vehicle_make_model) parts.push(trip.vehicle_make_model);
  const base = parts.length > 0 ? parts.join(" · ") : `#${trip.vehicle_id ?? ""}`;
  return `${base} (${savedSuffix})`;
}

export default function MileageTripModal({
  mode,
  initialDateKey,
  trip,
  vehicles,
  vehiclesLoading,
  vehiclesError,
  isPending,
  onClose,
  onCreate,
  onUpdate,
}: MileageTripModalProps) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  useBodyScrollLock(true);

  const initialTimes = useMemo(() => {
    if (mode === "edit" && trip) {
      return {
        startTime: isoToDateTimeLocal(trip.start_time),
        endTime: isoToDateTimeLocal(trip.end_time),
      };
    }
    return buildDefaultDateTimeLocal(
      initialDateKey ?? toLocalDateKey(new Date()),
    );
  }, [mode, trip, initialDateKey]);

  const [origin, setOrigin] = useState(() =>
    mode === "edit" && trip ? trip.origin : "",
  );
  const [destination, setDestination] = useState(() =>
    mode === "edit" && trip ? trip.destination : "",
  );
  const [startTime, setStartTime] = useState(() => initialTimes.startTime);
  const [endTime, setEndTime] = useState(() => initialTimes.endTime);
  const [endTimeManuallyEdited, setEndTimeManuallyEdited] = useState(false);
  const [distanceKm, setDistanceKm] = useState(() =>
    mode === "edit" && trip ? String(trip.distance_km) : "",
  );
  const [description, setDescription] = useState(() =>
    mode === "edit" && trip ? (trip.description ?? "") : "",
  );
  const [roundTrip, setRoundTrip] = useState(() =>
    mode === "edit" && trip ? trip.round_trip : false,
  );
  const [error, setError] = useState<string | null>(null);
  const [vehicleManuallyChanged, setVehicleManuallyChanged] = useState(false);

  const editDrift = useMemo(() => {
    if (mode !== "edit" || !trip) return null;
    if (vehiclesLoading || vehiclesError) return null;
    return detectVehicleSnapshotDrift(trip, vehicles);
  }, [mode, trip, vehicles, vehiclesLoading, vehiclesError]);

  const initialVehicleChoice: VehicleChoice = useMemo(() => {
    if (mode === "edit" && trip) {
      if (vehiclesLoading || vehiclesError) {
        return { kind: "keep_snapshot" };
      }
      if (editDrift === "matched" && trip.vehicle_id != null) {
        return { kind: "vehicle", vehicleId: trip.vehicle_id };
      }
      if (editDrift === "drifted" || editDrift === "deleted") {
        return { kind: "keep_snapshot" };
      }
      return { kind: "none" };
    }
    const defaultVehicle = vehicles.find((v) => v.is_default);
    if (defaultVehicle) {
      return { kind: "vehicle", vehicleId: defaultVehicle.id };
    }
    return { kind: "none" };
  }, [mode, trip, vehicles, vehiclesLoading, vehiclesError, editDrift]);

  const [selectedVehicleChoice, setSelectedVehicleChoice] =
    useState<VehicleChoice>(initialVehicleChoice);

  const effectiveVehicleChoice = vehicleManuallyChanged
    ? selectedVehicleChoice
    : initialVehicleChoice;

  const selectableVehicles = useMemo(() => {
    if (mode === "edit" && trip && editDrift === "drifted" && trip.vehicle_id != null) {
      return vehicles.filter((v) => v.id !== trip.vehicle_id);
    }
    return vehicles;
  }, [mode, trip, editDrift, vehicles]);

  const showKeepSnapshotOption =
    mode === "edit" &&
    trip != null &&
    (vehiclesLoading ||
      vehiclesError ||
      editDrift === "drifted" ||
      editDrift === "deleted");

  const draft: MileageDraftValues = useMemo(
    () => ({
      origin,
      destination,
      startTime,
      endTime,
      distanceKm,
      description,
      roundTrip,
    }),
    [origin, destination, startTime, endTime, distanceKm, description, roundTrip],
  );

  const isDirty = useMemo(() => {
    if (mode === "edit" && trip) {
      const origStart = isoToDateTimeLocal(trip.start_time);
      const origEnd = isoToDateTimeLocal(trip.end_time);
      const origDesc = (trip.description ?? "").trim();
      const parsedKm = parseStrictDecimal(distanceKm);
      const kmDirty =
        parsedKm === null
          ? distanceKm.trim() !== String(trip.distance_km)
          : Math.abs(parsedKm - trip.distance_km) > 1e-9;
      return (
        origin.trim() !== trip.origin.trim() ||
        destination.trim() !== trip.destination.trim() ||
        startTime !== origStart ||
        endTime !== origEnd ||
        kmDirty ||
        description.trim() !== origDesc ||
        roundTrip !== trip.round_trip ||
        !sameVehicleChoice(effectiveVehicleChoice, initialVehicleChoice)
      );
    }
    return (
      origin.trim() !== "" ||
      destination.trim() !== "" ||
      distanceKm.trim() !== "" ||
      description.trim() !== "" ||
      roundTrip ||
      startTime !== initialTimes.startTime ||
      endTime !== initialTimes.endTime ||
      !sameVehicleChoice(effectiveVehicleChoice, initialVehicleChoice)
    );
  }, [
    mode,
    trip,
    origin,
    destination,
    startTime,
    endTime,
    distanceKm,
    description,
    roundTrip,
    effectiveVehicleChoice,
    initialVehicleChoice,
    initialTimes.startTime,
    initialTimes.endTime,
  ]);

  const showRecalcHint = useMemo(() => {
    if (mode !== "edit" || !trip) return false;
    const parsedKm = parseStrictDecimal(distanceKm);
    const distanceChanged =
      parsedKm !== null && Math.abs(parsedKm - trip.distance_km) > 1e-9;
    let utcDateChanged = false;
    if (startTime) {
      const parsedStart = new Date(startTime);
      const origStart = new Date(trip.start_time);
      if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(origStart.getTime())) {
        utcDateChanged =
          parsedStart.toISOString().slice(0, 10) !==
          origStart.toISOString().slice(0, 10);
      }
    }
    const vehicleChanged = !sameVehicleChoice(
      effectiveVehicleChoice,
      initialVehicleChoice,
    );
    return distanceChanged || utcDateChanged || vehicleChanged;
  }, [
    mode,
    trip,
    distanceKm,
    startTime,
    effectiveVehicleChoice,
    initialVehicleChoice,
  ]);

  const durationPreview = useMemo(
    () => computeTripDurationPreview(startTime, endTime),
    [startTime, endTime],
  );

  const requestClose = useCallback(() => {
    if (isPending) return;
    if (isDirty && !window.confirm(t("guard_unsaved_changes"))) {
      return;
    }
    onClose();
  }, [isPending, isDirty, t, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const mapApiError = (err: unknown): string => {
    const axiosErr = err as {
      code?: string;
      response?: { status?: number; data?: { detail?: string } };
    };
    if (
      axiosErr?.code === "ECONNABORTED" ||
      axiosErr?.code === "ETIMEDOUT"
    ) {
      return t("mileage_error_timeout");
    }
    const status = axiosErr?.response?.status;
    if (status === 409) return t("mileage_error_conflict");
    if (status === 429) return t("mileage_error_rate_limit");
    const detail = axiosErr?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
    return t("mileage_error_save");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);

    if (!origin.trim() || !destination.trim()) {
      setError(t("mileage_error_origin_dest"));
      return;
    }
    if (!startTime || !endTime) {
      setError(t("mileage_error_times_required"));
      return;
    }
    const parsedStart = new Date(startTime);
    const parsedEnd = new Date(endTime);
    if (
      Number.isNaN(parsedStart.getTime()) ||
      Number.isNaN(parsedEnd.getTime()) ||
      parsedEnd <= parsedStart
    ) {
      setError(t("mileage_end_before_start"));
      return;
    }
    const km = parseStrictDecimal(distanceKm);
    if (km === null) {
      setError(t("mileage_distance_invalid"));
      return;
    }

    try {
      if (mode === "edit" && trip) {
        const patch = buildMileagePatchPayload(
          trip,
          draft,
          effectiveVehicleChoice,
          initialVehicleChoice,
        );
        if (patch === null) {
          onClose();
          return;
        }
        await onUpdate(trip.id, patch);
      } else {
        const payload: MileageCreatePayload = {
          origin: origin.trim(),
          destination: destination.trim(),
          distance_km: km,
          start_time: parsedStart.toISOString(),
          end_time: parsedEnd.toISOString(),
          round_trip: roundTrip,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(effectiveVehicleChoice.kind === "vehicle"
            ? { vehicle_id: effectiveVehicleChoice.vehicleId }
            : {}),
        };
        await onCreate(payload);
      }
    } catch (err: unknown) {
      setError(mapApiError(err));
    }
  };

  const headingId = "mileage-trip-modal-heading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
              {mode === "edit" ? (
                <Pencil className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Plus className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <h2
              id={headingId}
              className="text-base font-bold text-foreground truncate"
            >
              {mode === "edit" ? t("mileage_edit_title") : t("mileage_add_trip")}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isPending}
            aria-label={tc("close")}
            className="min-w-10 min-h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form body + sticky footer */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col min-h-0 flex-1 overflow-hidden"
        >
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto min-h-0 flex-1">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
              >
                {error}
              </p>
            )}

            {/* Origin & Destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label
                  htmlFor="mileage-modal-origin"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  {t("mileage_origin")}
                </label>
                <input
                  id="mileage-modal-origin"
                  type="text"
                  required
                  maxLength={255}
                  placeholder={t("mileage_origin")}
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="mileage-modal-destination"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  {t("mileage_destination")}
                </label>
                <input
                  id="mileage-modal-destination"
                  type="text"
                  required
                  maxLength={255}
                  placeholder={t("mileage_destination")}
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Start & End Time */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label
                    htmlFor="mileage-modal-start-time"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    {t("mileage_start_time")}
                  </label>
                  <input
                    id="mileage-modal-start-time"
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      if (!endTimeManuallyEdited && startTime && endTime) {
                        setEndTime(
                          shiftEndTimeForStartChange(startTime, endTime, nextStart),
                        );
                      }
                      setStartTime(nextStart);
                      if (error) setError(null);
                    }}
                    className="block w-full min-w-0 max-w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="mileage-modal-end-time"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    {t("mileage_end_time")}
                  </label>
                  <input
                    id="mileage-modal-end-time"
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      setEndTimeManuallyEdited(true);
                      if (error) setError(null);
                    }}
                    className="block w-full min-w-0 max-w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              {durationPreview && (
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {t("mileage_duration_preview", {
                    duration: durationPreview.formatted,
                  })}
                  {durationPreview.dayOffset > 0 && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                      {t("mileage_next_day_suffix", {
                        days: durationPreview.dayOffset,
                      })}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Vehicle selector */}
            <div className="min-w-0">
              <label
                htmlFor="mileage-modal-vehicle"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                <Car className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t("mileage_vehicle")}</span>
              </label>
              <select
                id="mileage-modal-vehicle"
                value={vehicleChoiceToSelectValue(effectiveVehicleChoice)}
                disabled={mode === "edit" && (vehiclesLoading || vehiclesError)}
                onChange={(e) => {
                  setVehicleManuallyChanged(true);
                  setSelectedVehicleChoice(
                    selectValueToVehicleChoice(e.target.value),
                  );
                  if (error) setError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
              >
                {showKeepSnapshotOption && trip && (
                  <option value={KEEP_SNAPSHOT_VALUE}>
                    {formatSavedSnapshotLabel(
                      trip,
                      t("mileage_vehicle_saved_on_trip"),
                    )}
                  </option>
                )}
                <option value="">{t("mileage_vehicle_none")}</option>
                {selectableVehicles.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {`${v.plate_number}${v.make_model ? ` · ${v.make_model}` : ""}${v.fuel_consumption_l_per_100km != null ? ` (${v.fuel_consumption_l_per_100km} l/100km)` : ""}`}
                  </option>
                ))}
              </select>
              {mode === "edit" && vehiclesLoading && (
                <p className="text-xs text-muted mt-1">
                  {t("mileage_vehicles_loading_hint")}
                </p>
              )}
              {mode === "edit" && vehiclesError && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t("mileage_vehicles_error_hint")}
                </p>
              )}
              {!vehiclesLoading && !vehiclesError && vehicles.length === 0 && (
                <p className="text-xs text-muted mt-1">
                  {t("mileage_vehicle_add_hint")}{" "}
                  <Link
                    href="/profile"
                    className="text-teal-600 dark:text-teal-400 underline hover:text-teal-700 dark:hover:text-teal-300"
                  >
                    {t("mileage_vehicle_add_link")}
                  </Link>
                  .
                </p>
              )}
            </div>

            {/* Distance & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 min-w-0">
                <label
                  htmlFor="mileage-modal-distance"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  {t("mileage_distance")}
                </label>
                <input
                  id="mileage-modal-distance"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="e.g. 24.5"
                  value={distanceKm}
                  onChange={(e) => {
                    setDistanceKm(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="sm:col-span-7 min-w-0">
                <label
                  htmlFor="mileage-modal-description"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  {t("mileage_desc_optional")}
                </label>
                <input
                  id="mileage-modal-description"
                  type="text"
                  maxLength={1000}
                  placeholder={t("mileage_desc_optional")}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Round trip */}
            <div className="space-y-1">
              <label
                htmlFor="mileage-modal-round-trip"
                className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
              >
                <input
                  id="mileage-modal-round-trip"
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                  className="h-4 w-4 rounded border-input-border text-teal-600 focus:ring-teal-500"
                />
                <span>{t("mileage_round_trip")}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("mileage_round_trip_hint")}
              </p>
            </div>

            {/* Edit recalculation hint */}
            {showRecalcHint && (
              <p className="text-xs text-teal-700 dark:text-teal-300 bg-teal-50/80 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 rounded-lg px-3 py-2">
                {t("mileage_recalc_hint")}
              </p>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="p-4 sm:px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-border bg-card flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={requestClose}
              disabled={isPending}
              className="min-h-11 px-4 py-2 rounded-lg border border-input-border text-sm font-medium text-slate-700 dark:text-slate-200 bg-card hover:bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {t("edit_cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {isPending && (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              )}
              <span>
                {mode === "edit"
                  ? isPending
                    ? t("mileage_saving")
                    : t("mileage_save_changes")
                  : isPending
                    ? t("mileage_adding")
                    : t("mileage_add_trip")}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
