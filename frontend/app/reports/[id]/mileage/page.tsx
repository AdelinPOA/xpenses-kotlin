"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { downloadBlob, MileageRecord, Report, UserVehicle } from "@/lib/api";
import { reportKeys, mileageKeys, vehicleKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import MileageWeeklyList from "@/components/reports/MileageWeeklyList";
import { ArrowLeft, FileSpreadsheet, Gauge, Plus } from "lucide-react";
import Link from "next/link";
import { formatAmount, parseLocaleNumber } from "@/lib/format";
import { LOCALE_TO_INTL, type Locale } from "@/i18n/config";
import {
  addDaysToDateKey,
  buildDefaultDateTimeLocal,
  buildMileageWeeks,
  buildPastePayload,
  formatDayHeading,
  formatDuration,
} from "@/lib/mileageWeeks";
import { useLocale, useTranslations } from "next-intl";

export default function MileagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reportId = parseInt(id);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [odometerInput, setOdometerInput] = useState<string | null>(null);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [odometerSaved, setOdometerSaved] = useState(false);
  const [downloadingTripSheet, setDownloadingTripSheet] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedTrip, setCopiedTrip] = useState<MileageRecord | null>(null);
  const [extraWeekStarts, setExtraWeekStarts] = useState<string[]>([]);
  const [pastingDates, setPastingDates] = useState<Set<string>>(() => new Set());
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const inFlightDatesRef = useRef<Set<string>>(new Set());
  const pasteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;

  useEffect(() => {
    return () => {
      if (pasteNoticeTimerRef.current) {
        clearTimeout(pasteNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!copiedTrip) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCopiedTrip(null);
        setPasteNotice(null);
        setPasteError(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copiedTrip]);

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const isDraft = report?.status === "draft";
  const weeks = useMemo(
    () =>
      buildMileageWeeks({
        records: report?.mileage_records ?? [],
        dateFrom: report?.date_from,
        dateTo: report?.date_to,
        includeEmptyDays: isDraft,
        extraWeekStarts,
      }),
    [report?.mileage_records, report?.date_from, report?.date_to, isDraft, extraWeekStarts],
  );

  const { data: vehicles = [], isSuccess: vehiclesLoaded } = useQuery<UserVehicle[]>({
    queryKey: vehicleKeys.me(),
    queryFn: () => api.get("/users/me/vehicles").then((r) => r.data),
    enabled: report?.status === "draft",
  });

  const defaultVehicle = vehicles.find((v) => v.is_default);
  const defaultVehicleId = defaultVehicle ? String(defaultVehicle.id) : "";
  const effectiveVehicleId = selectedVehicleId ?? defaultVehicleId;
  const selectedVehicle = effectiveVehicleId
    ? vehicles.find((v) => String(v.id) === effectiveVehicleId)
    : undefined;
  const prefillVehicle =
    (selectedVehicle?.last_odometer_km != null ? selectedVehicle : undefined) ??
    (defaultVehicle?.last_odometer_km != null ? defaultVehicle : undefined) ??
    vehicles.find((v) => v.last_odometer_km != null);
  const prefillKm = prefillVehicle?.last_odometer_km ?? null;

  const effectiveOdometerInput =
    odometerInput ??
    (report?.starting_odometer_km != null ? String(report.starting_odometer_km) : "");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) });
    qc.invalidateQueries({ queryKey: mileageKeys.all });
  };

  const saveOdometer = useMutation({
    mutationFn: (payload: {
      starting_odometer_km?: number;
      clear_starting_odometer?: boolean;
    }) => api.patch<Report>(`/reports/${id}`, payload),
    onSuccess: (res) => {
      if (res?.data) {
        qc.setQueryData(reportKeys.detail(reportId), res.data);
      }
      setOdometerInput(null);
      setOdometerError(null);
      setOdometerSaved(true);
      invalidate();
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setOdometerSaved(false);
      setOdometerError(detail ?? t("mileage_starting_odometer_invalid"));
    },
  });

  const handleSaveOdometer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOdometerError(null);
    setOdometerSaved(false);
    const trimmed = effectiveOdometerInput.trim();
    if (trimmed === "") {
      saveOdometer.mutate({ clear_starting_odometer: true });
      return;
    }
    const parsed = parseLocaleNumber(trimmed);
    if (
      !/^\d+([.,]\d)?$/.test(trimmed) ||
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      parsed > 9999999.9
    ) {
      setOdometerError(t("mileage_starting_odometer_invalid"));
      return;
    }
    saveOdometer.mutate({ starting_odometer_km: parsed });
  };

  const handleDownloadTripSheet = async () => {
    setDownloadingTripSheet(true);
    setExportError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadBlob(
        `/reports/${id}/mileage/trip-sheet`,
        {},
        `foaie_parcurs_raport_${id}_${today}.xlsx`,
      );
    } catch {
      setExportError(t("mileage_export_trip_sheet_error"));
    } finally {
      setDownloadingTripSheet(false);
    }
  };

  const addMileage = useMutation({
    mutationFn: (data: {
      origin: string;
      destination: string;
      distance_km: number;
      start_time: string;
      end_time: string;
      description?: string;
      vehicle_id?: number;
      round_trip?: boolean;
    }) =>
      api.post(`/reports/${id}/mileage`, data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setFormError(null);
      setOrigin("");
      setDestination("");
      setDistanceKm("");
      setStartTime("");
      setEndTime("");
      setDescription("");
      setRoundTrip(false);
      setSelectedVehicleId(null);
    },
    onError: (e: any) => {
      setFormError(e.response?.data?.detail ?? t("mileage_error_save") ?? "Failed to save trip");
    },
  });

  const deleteMileage = useMutation({
    mutationFn: (mileageId: number) => api.delete(`/reports/${id}/mileage/${mileageId}`),
    onSuccess: () => {
      setFormError(null);
      invalidate();
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(detail ?? t("mileage_error_delete"));
    },
  });

  const confirmDeleteMileage = (mileageId: number) => {
    if (window.confirm(t("mileage_confirm_delete"))) {
      setFormError(null);
      deleteMileage.mutate(mileageId);
    }
  };

  const handleAdd = () => {
    setFormError(null);
    const km = parseLocaleNumber(distanceKm);
    if (!origin.trim() || !destination.trim()) {
      setFormError(t("mileage_error_origin_dest") || "Both origin and destination are required.");
      return;
    }
    if (!startTime || !endTime) {
      setFormError(t("mileage_error_times_required") || "Start time and end time are required.");
      return;
    }
    if (new Date(endTime) <= new Date(startTime)) {
      setFormError(t("mileage_error_time_order") || "End time must be after start time.");
      return;
    }
    if (isNaN(km) || km <= 0) {
      setFormError(t("mileage_error_distance") || "Distance must be greater than 0 km.");
      return;
    }
    addMileage.mutate({
      origin: origin.trim(),
      destination: destination.trim(),
      distance_km: km,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      round_trip: roundTrip,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(effectiveVehicleId ? { vehicle_id: Number(effectiveVehicleId) } : {}),
    });
  };

  const handleCopyTrip = (trip: MileageRecord) => {
    setCopiedTrip(trip);
    setPasteError(null);
    setPasteNotice(null);
  };

  const handleClearClipboard = () => {
    setCopiedTrip(null);
    setPasteError(null);
    setPasteNotice(null);
  };

  const handleOpenFormForDay = (dateKey: string) => {
    const nextTimes = buildDefaultDateTimeLocal(dateKey, startTime, endTime);
    setStartTime(nextTimes.startTime);
    setEndTime(nextTimes.endTime);
    setShowForm(true);
    setFormError(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const handleAddPreviousWeek = () => {
    if (weeks.length === 0) return;
    const prevStart = addDaysToDateKey(weeks[0].weekStartKey, -7);
    setExtraWeekStarts((prev) => (prev.includes(prevStart) ? prev : [...prev, prevStart]));
  };

  const handleAddNextWeek = () => {
    if (weeks.length === 0) return;
    const nextStart = addDaysToDateKey(weeks[weeks.length - 1].weekStartKey, 7);
    setExtraWeekStarts((prev) => (prev.includes(nextStart) ? prev : [...prev, nextStart]));
  };

  const handlePasteToDates = async (targetDateKeys: string[]) => {
    if (!copiedTrip || !isDraft || targetDateKeys.length === 0) return;

    const pending: string[] = [];
    const seen = new Set<string>();
    for (const dateKey of targetDateKeys) {
      if (!seen.has(dateKey) && !inFlightDatesRef.current.has(dateKey)) {
        seen.add(dateKey);
        pending.push(dateKey);
      }
    }
    if (pending.length === 0) return;

    for (const dateKey of pending) {
      inFlightDatesRef.current.add(dateKey);
    }
    setPastingDates(new Set(inFlightDatesRef.current));
    setPasteError(null);
    setPasteNotice(null);
    if (pasteNoticeTimerRef.current) {
      clearTimeout(pasteNoticeTimerRef.current);
      pasteNoticeTimerRef.current = null;
    }

    const validVehicleIds = vehiclesLoaded ? new Set(vehicles.map((v) => v.id)) : null;
    const succeeded: string[] = [];
    let errorDetail: string | null = null;
    let hadError = false;

    try {
      for (const dateKey of pending) {
        try {
          const payload = buildPastePayload(copiedTrip, dateKey, validVehicleIds);
          await api.post(`/reports/${id}/mileage`, payload);
          succeeded.push(dateKey);
        } catch (err: unknown) {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          errorDetail = detail ?? t("mileage_paste_error");
          hadError = true;
          break;
        } finally {
          inFlightDatesRef.current.delete(dateKey);
          setPastingDates(new Set(inFlightDatesRef.current));
        }
      }
    } finally {
      for (const dateKey of pending) {
        inFlightDatesRef.current.delete(dateKey);
      }
      setPastingDates(new Set(inFlightDatesRef.current));
    }

    if (succeeded.length > 0) {
      invalidate();
    }

    if (hadError) {
      if (succeeded.length > 0) {
        setPasteError(
          t("mileage_paste_partial_error", {
            succeeded: succeeded.length,
            total: pending.length,
            detail: errorDetail ?? t("mileage_paste_error"),
          }),
        );
      } else {
        setPasteError(errorDetail ?? t("mileage_paste_error"));
      }
    } else if (succeeded.length === 1) {
      const heading = formatDayHeading(succeeded[0], LOCALE_TO_INTL[locale]);
      setPasteNotice(
        t("mileage_paste_success_one", {
          day: `${heading.weekday}, ${heading.shortDate}`,
        }),
      );
      pasteNoticeTimerRef.current = setTimeout(() => {
        setPasteNotice(null);
      }, 4000);
    } else if (succeeded.length > 1) {
      setPasteNotice(t("mileage_paste_success_many", { count: succeeded.length }));
      pasteNoticeTimerRef.current = setTimeout(() => {
        setPasteNotice(null);
      }, 4000);
    }
  };

  if (isLoading) return <AppShell><p className="text-muted-foreground text-sm mt-8">{t("mileage_loading")}</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">{t("mileage_not_found")}</p></AppShell>;

  const records = report.mileage_records || [];
  const totalKm = records.reduce((s, m) => s + m.distance_km, 0);
  const totalNet = records.reduce((s, m) => s + m.amount_eur, 0);
  const totalGross = records.reduce((s, m) => s + m.amount_before_tax, 0);
  const totalDuration = records.reduce((s, m) => s + m.duration_minutes, 0);

  return (
    <AppShell>
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t("mileage_back")}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{t("mileage_heading")}</h1>
              <Badge status={report.status} />
            </div>
            <p className="text-sm text-muted mt-1">{report.title}</p>
          </div>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => void handleDownloadTripSheet()}
              disabled={downloadingTripSheet}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 border border-input-border text-slate-700 dark:text-slate-200 bg-card hover:bg-card-hover text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{downloadingTripSheet ? t("detail_exporting") : t("mileage_export_trip_sheet")}</span>
            </button>
          )}
        </div>
        {exportError && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            {exportError}
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-teal-500 uppercase mb-1">{t("mileage_total_distance")}</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalKm.toFixed(1)} km</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-blue-500 uppercase mb-1">{t("mileage_driving_time")}</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatDuration(totalDuration)}</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase mb-1">{t("mileage_gross")}</p>
          <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{formatAmount(totalGross, "EUR")}</p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-500 uppercase mb-1">{t("mileage_net")}</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalNet, "EUR")}</p>
        </div>
      </div>

      {/* Starting odometer card */}
      {report.status === "draft" ? (
        <div className="bg-card rounded-xl shadow-sm p-4 mb-6">
          <form onSubmit={handleSaveOdometer} className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label
                  htmlFor="mileage-starting-odometer"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  <Gauge className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("mileage_starting_odometer")}</span>
                </label>
                <input
                  id="mileage-starting-odometer"
                  type="text"
                  inputMode="decimal"
                  placeholder={t("mileage_starting_odometer_placeholder")}
                  value={effectiveOdometerInput}
                  onChange={(e) => {
                    setOdometerInput(e.target.value);
                    if (odometerError) setOdometerError(null);
                    if (odometerSaved) setOdometerSaved(false);
                  }}
                  className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saveOdometer.isPending}
                  className="min-h-11 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {t("mileage_starting_odometer_save")}
                </button>
                {report.starting_odometer_km == null && prefillKm != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setOdometerInput(String(prefillKm));
                      setOdometerError(null);
                      setOdometerSaved(false);
                    }}
                    className="min-h-11 px-3 py-2 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                  >
                    {t("mileage_starting_odometer_prefill", {
                      km: prefillKm.toLocaleString(LOCALE_TO_INTL[locale], {
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </button>
                )}
              </div>
            </div>
            {report.starting_odometer_km != null && totalKm > 0 && (
              <p className="text-xs text-muted">
                {report.starting_odometer_km.toFixed(1)} km → {(report.starting_odometer_km + totalKm).toFixed(1)} km
              </p>
            )}
            {odometerError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {odometerError}
              </p>
            )}
            {odometerSaved && !odometerError && (
              <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
                {t("mileage_starting_odometer_saved")}
              </p>
            )}
          </form>
        </div>
      ) : report.starting_odometer_km != null ? (
        <div className="bg-card rounded-xl shadow-sm p-4 mb-6 flex items-center gap-2 text-sm">
          <Gauge className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
          <span className="text-muted">{t("mileage_starting_odometer")}:</span>
          <span className="font-semibold text-foreground">
            {report.starting_odometer_km.toFixed(1)} km → {(report.starting_odometer_km + totalKm).toFixed(1)} km
          </span>
        </div>
      ) : null}

      {/* Add button */}
      {report.status === "draft" && (
        <div className="mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              showForm
                ? "bg-teal-600 text-white"
                : "border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30"
            }`}
          >
            <Plus className="w-4 h-4" /> {t("mileage_add_trip")}
          </button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/50 rounded-xl p-4 mb-6 space-y-3"
        >
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("mileage_record_trip")}</p>

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mileage-origin" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_origin")}
              </label>
              <input
                id="mileage-origin"
                type="text"
                required
                placeholder={t("mileage_origin")}
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="mileage-destination" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_destination")}
              </label>
              <input
                id="mileage-destination"
                type="text"
                required
                placeholder={t("mileage_destination")}
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mileage-start-time" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_start_time")}
              </label>
              <input
                id="mileage-start-time"
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label htmlFor="mileage-end-time" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_end_time")}
              </label>
              <input
                id="mileage-end-time"
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mileage-vehicle" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t("mileage_vehicle")}
            </label>
            <select
              id="mileage-vehicle"
              value={effectiveVehicleId}
              onChange={(e) => {
                setSelectedVehicleId(e.target.value);
                if (formError) setFormError(null);
              }}
              className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">{t("mileage_vehicle_none")}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {`${v.plate_number}${v.make_model ? ` · ${v.make_model}` : ""}${v.fuel_consumption_l_per_100km != null ? ` (${v.fuel_consumption_l_per_100km} l/100km)` : ""}`}
                </option>
              ))}
            </select>
            {vehiclesLoaded && vehicles.length === 0 && (
              <p className="text-xs text-muted mt-1">
                {t("mileage_vehicle_add_hint")}{" "}
                <Link href="/profile" className="text-teal-600 dark:text-teal-400 underline hover:text-teal-700 dark:hover:text-teal-300">
                  {t("mileage_vehicle_add_link")}
                </Link>
                .
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label htmlFor="mileage-distance" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_distance")} (km)
              </label>
              <input
                id="mileage-distance"
                type="number"
                step="0.1"
                min="0.1"
                required
                placeholder={t("mileage_distance")}
                value={distanceKm}
                onChange={(e) => {
                  setDistanceKm(e.target.value);
                  if (formError) setFormError(null);
                }}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="sm:col-span-6">
              <label htmlFor="mileage-description" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t("mileage_desc_optional")}
              </label>
              <input
                id="mileage-description"
                type="text"
                placeholder={t("mileage_desc_optional")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-11 px-3 py-2 border border-input-border rounded-lg text-base sm:text-sm bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={addMileage.isPending}
                className="w-full min-h-11 flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {addMileage.isPending ? t("mileage_adding") : t("mileage_add_trip")}
              </button>
            </div>
          </div>

          <div className="pt-1">
            <label
              htmlFor="mileage-round-trip"
              className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
            >
              <input
                id="mileage-round-trip"
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
                className="h-4 w-4 rounded border-input-border text-teal-600 focus:ring-teal-500"
              />
              <span>{t("mileage_round_trip")}</span>
            </label>
          </div>
        </form>
      )}

      {/* Weekly mileage trips */}
      <MileageWeeklyList
        weeks={weeks}
        totalRecords={records.length}
        totalKm={totalKm}
        totalDuration={totalDuration}
        totalGross={totalGross}
        totalNet={totalNet}
        isDraft={isDraft}
        locale={locale}
        copiedTrip={copiedTrip}
        pastingDates={pastingDates}
        deletingTrip={deleteMileage.isPending}
        pasteNotice={pasteNotice}
        pasteError={pasteError}
        onCopyTrip={handleCopyTrip}
        onClearClipboard={handleClearClipboard}
        onPasteToDates={(dates) => void handlePasteToDates(dates)}
        onAddForDay={handleOpenFormForDay}
        onDeleteTrip={confirmDeleteMileage}
        onAddPreviousWeek={handleAddPreviousWeek}
        onAddNextWeek={handleAddNextWeek}
      />
    </AppShell>
  );
}
