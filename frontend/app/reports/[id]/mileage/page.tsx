"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, {
  createMileage,
  deleteMileage as deleteMileageApi,
  downloadBlob,
  updateMileage as updateMileageApi,
  type MileageCreatePayload,
  type MileageRecord,
  type MileageUpdatePayload,
  type Report,
  type UserVehicle,
} from "@/lib/api";
import { reportKeys, mileageKeys, vehicleKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import QueryErrorNotice from "@/components/ui/QueryErrorNotice";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import MileageWeeklyList from "@/components/reports/MileageWeeklyList";
import MileageTripModal from "@/components/reports/MileageTripModal";
import { ArrowLeft, FileSpreadsheet, Gauge, Plus } from "lucide-react";
import Link from "next/link";
import {
  formatAmount,
  formatDistanceKm,
  parseLocaleNumber,
} from "@/lib/format";
import { LOCALE_TO_INTL, type Locale } from "@/i18n/config";
import {
  addDaysToDateKey,
  buildMileageWeeks,
  buildPastePayload,
  formatDayHeading,
  formatDuration,
  getMondayDateKey,
  isoToLocalDateKey,
} from "@/lib/mileageWeeks";
import { useLocale, useTranslations } from "next-intl";

type ModalState =
  | null
  | { mode: "create"; initialDateKey?: string }
  | { mode: "edit"; trip: MileageRecord };

export default function MileagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const reportId = parseInt(id, 10);
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();

  const [modalState, setModalState] = useState<ModalState>(null);
  const [odometerInput, setOdometerInput] = useState<string | null>(null);
  const [odometerError, setOdometerError] = useState<string | null>(null);
  const [odometerSaved, setOdometerSaved] = useState(false);
  const [downloadingTripSheet, setDownloadingTripSheet] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedTripId, setCopiedTripId] = useState<number | null>(null);
  const [extraWeekStarts, setExtraWeekStarts] = useState<string[]>([]);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(
    {},
  );
  const [highlightedTripId, setHighlightedTripId] = useState<number | null>(
    null,
  );
  const [pastingDates, setPastingDates] = useState<Set<string>>(
    () => new Set(),
  );
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const inFlightDatesRef = useRef<Set<string>>(new Set());
  const pasteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;

  useEffect(() => {
    return () => {
      if (pasteNoticeTimerRef.current) {
        clearTimeout(pasteNoticeTimerRef.current);
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const {
    data: report,
    isLoading,
    isError,
    isFetching: reportFetching,
    refetch: refetchReport,
  } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const canEdit = Boolean(
    user && report && report.status === "draft" && report.user_id === user.id,
  );

  const copiedTrip = useMemo(() => {
    if (copiedTripId == null) return null;
    return (
      report?.mileage_records?.find((record) => record.id === copiedTripId) ??
      null
    );
  }, [copiedTripId, report?.mileage_records]);

  useEffect(() => {
    if (!copiedTrip || modalState !== null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCopiedTripId(null);
        setPasteNotice(null);
        setPasteError(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copiedTrip, modalState]);

  const weeks = useMemo(
    () =>
      buildMileageWeeks({
        records: report?.mileage_records ?? [],
        dateFrom: report?.date_from,
        dateTo: report?.date_to,
        includeEmptyDays: canEdit,
        extraWeekStarts,
      }),
    [
      report?.mileage_records,
      report?.date_from,
      report?.date_to,
      canEdit,
      extraWeekStarts,
    ],
  );

  const {
    data: vehicles = [],
    isLoading: vehiclesLoading,
    isError: vehiclesError,
    isSuccess: vehiclesLoaded,
  } = useQuery<UserVehicle[]>({
    queryKey: vehicleKeys.me(),
    queryFn: () => api.get("/users/me/vehicles").then((r) => r.data),
    enabled: canEdit,
  });

  const defaultVehicle = vehicles.find((v) => v.is_default);
  const prefillVehicle =
    (defaultVehicle?.last_odometer_km != null ? defaultVehicle : undefined) ??
    vehicles.find((v) => v.last_odometer_km != null);
  const prefillKm = prefillVehicle?.last_odometer_km ?? null;

  const effectiveOdometerInput =
    odometerInput ??
    (report?.starting_odometer_km != null
      ? String(report.starting_odometer_km)
      : "");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: reportKeys.all });
    qc.invalidateQueries({ queryKey: mileageKeys.all });
  };

  const closeModalAndRestoreFocus = () => {
    setModalState(null);
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el && el.isConnected) {
      requestAnimationFrame(() => el.focus());
    }
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
      const detail = (
        e as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail;
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
    mutationFn: (payload: MileageCreatePayload) =>
      createMileage(reportId, payload),
    onSuccess: (created) => {
      invalidate();
      const targetDayKey = isoToLocalDateKey(created.start_time);
      const targetWeekStart = getMondayDateKey(targetDayKey);
      setCollapsedWeeks((prev) =>
        prev[targetWeekStart] ? { ...prev, [targetWeekStart]: false } : prev,
      );
      closeModalAndRestoreFocus();
    },
  });

  const editMileage = useMutation({
    mutationFn: ({
      mileageId,
      payload,
    }: {
      mileageId: number;
      payload: MileageUpdatePayload;
      previousDayKey: string;
    }) => updateMileageApi(reportId, mileageId, payload),
    onSuccess: (updated, variables) => {
      invalidate();
      const targetDayKey = isoToLocalDateKey(updated.start_time);
      const targetWeekStart = getMondayDateKey(targetDayKey);
      setCollapsedWeeks((prev) =>
        prev[targetWeekStart] ? { ...prev, [targetWeekStart]: false } : prev,
      );

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      setHighlightedTripId(updated.id);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedTripId(null);
        highlightTimerRef.current = null;
      }, 2500);

      if (targetDayKey !== variables.previousDayKey) {
        const heading = formatDayHeading(targetDayKey, LOCALE_TO_INTL[locale]);
        toast.success(
          t("mileage_toast_moved", {
            day: `${heading.weekday}, ${heading.shortDate}`,
          }),
        );
      } else {
        toast.success(t("mileage_toast_updated"));
      }
      closeModalAndRestoreFocus();
    },
    onError: (err: unknown) => {
      const axiosErr = err as {
        code?: string;
        response?: { status?: number };
      };
      const status = axiosErr?.response?.status;
      const isTimeout =
        axiosErr?.code === "ECONNABORTED" || axiosErr?.code === "ETIMEDOUT";
      if (
        isTimeout ||
        status === 400 ||
        status === 404 ||
        status === 409
      ) {
        invalidate();
      }
    },
  });

  const deleteMileage = useMutation({
    mutationFn: (mileageId: number) => deleteMileageApi(reportId, mileageId),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: unknown) => {
      const detail = (
        e as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail;
      toast.error(detail ?? t("mileage_error_delete"));
    },
  });

  const confirmDeleteMileage = (mileageId: number) => {
    if (window.confirm(t("mileage_confirm_delete"))) {
      deleteMileage.mutate(mileageId);
    }
  };

  const handleCopyTrip = (trip: MileageRecord) => {
    setCopiedTripId(trip.id);
    setPasteError(null);
    setPasteNotice(null);
  };

  const handleClearClipboard = () => {
    setCopiedTripId(null);
    setPasteError(null);
    setPasteNotice(null);
  };

  const handleOpenCreateModal = (
    dateKey?: string,
    triggerEl?: HTMLElement | null,
  ) => {
    triggerRef.current = triggerEl ?? null;
    setModalState({ mode: "create", initialDateKey: dateKey });
  };

  const handleOpenEditModal = (
    trip: MileageRecord,
    triggerEl: HTMLElement | null,
  ) => {
    triggerRef.current = triggerEl;
    setModalState({ mode: "edit", trip });
  };

  const handleToggleWeek = (weekStartKey: string) => {
    setCollapsedWeeks((prev) => ({
      ...prev,
      [weekStartKey]: !prev[weekStartKey],
    }));
  };

  const handleAddPreviousWeek = () => {
    if (weeks.length === 0) return;
    const prevStart = addDaysToDateKey(weeks[0].weekStartKey, -7);
    setExtraWeekStarts((prev) =>
      prev.includes(prevStart) ? prev : [...prev, prevStart],
    );
  };

  const handleAddNextWeek = () => {
    if (weeks.length === 0) return;
    const nextStart = addDaysToDateKey(
      weeks[weeks.length - 1].weekStartKey,
      7,
    );
    setExtraWeekStarts((prev) =>
      prev.includes(nextStart) ? prev : [...prev, nextStart],
    );
  };

  const handlePasteToDates = async (targetDateKeys: string[]) => {
    if (!copiedTrip || !canEdit || targetDateKeys.length === 0) return;

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

    const validVehicleIds = vehiclesLoaded
      ? new Set(vehicles.map((v) => v.id))
      : null;
    const succeeded: string[] = [];
    let errorDetail: string | null = null;
    let hadError = false;

    try {
      for (const dateKey of pending) {
        try {
          const payload = buildPastePayload(copiedTrip, dateKey, validVehicleIds);
          await createMileage(reportId, payload);
          succeeded.push(dateKey);
        } catch (err: unknown) {
          const detail = (
            err as { response?: { data?: { detail?: string } } }
          )?.response?.data?.detail;
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
      setPasteNotice(
        t("mileage_paste_success_many", { count: succeeded.length }),
      );
      pasteNoticeTimerRef.current = setTimeout(() => {
        setPasteNotice(null);
      }, 4000);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground text-sm mt-8">
          {t("mileage_loading")}
        </p>
      </AppShell>
    );
  }
  if (isError) {
    return (
      <AppShell>
        <div className="mt-8">
          <QueryErrorNotice
            isFetching={reportFetching}
            onRetry={() => void refetchReport()}
          />
        </div>
      </AppShell>
    );
  }
  if (!report) {
    return (
      <AppShell>
        <p className="text-red-500 text-sm">{t("mileage_not_found")}</p>
      </AppShell>
    );
  }

  const records = report.mileage_records || [];
  const totalKm = records.reduce((s, m) => s + m.distance_km, 0);
  const totalNet = records.reduce((s, m) => s + m.amount_eur, 0);
  const totalGross = records.reduce((s, m) => s + m.amount_before_tax, 0);
  const totalDuration = records.reduce((s, m) => s + m.duration_minutes, 0);
  const mutatingDisabled = pastingDates.size > 0 || deleteMileage.isPending;

  return (
    <AppShell>
      <div className="mb-6">
        <Link
          href={`/reports/${id}`}
          className="flex items-center gap-1 text-sm text-muted hover:text-slate-800 dark:hover:text-slate-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />{" "}
          {t("mileage_back")}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {t("mileage_heading")}
              </h1>
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
              <FileSpreadsheet
                className="w-4 h-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                {downloadingTripSheet
                  ? t("detail_exporting")
                  : t("mileage_export_trip_sheet")}
              </span>
            </button>
          )}
        </div>
        {exportError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
          >
            {exportError}
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-teal-500 uppercase mb-1">
            {t("mileage_total_distance")}
          </p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
            {formatDistanceKm(totalKm)} {t("mileage_km")}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-blue-500 uppercase mb-1">
            {t("mileage_driving_time")}
          </p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {formatDuration(totalDuration)}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-slate-500 uppercase mb-1">
            {t("mileage_gross")}
          </p>
          <p className="text-xl font-bold text-slate-700 dark:text-slate-300">
            {formatAmount(totalGross, "EUR")}
          </p>
        </div>
        <div className="bg-card rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-500 uppercase mb-1">
            {t("mileage_net")}
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatAmount(totalNet, "EUR")}
          </p>
        </div>
      </div>

      {/* Starting odometer card */}
      {canEdit ? (
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
                {report.starting_odometer_km.toFixed(1)} km →{" "}
                {(report.starting_odometer_km + totalKm).toFixed(1)} km
              </p>
            )}
            {odometerError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {odometerError}
              </p>
            )}
            {odometerSaved && !odometerError && (
              <p
                role="status"
                className="text-xs text-emerald-600 dark:text-emerald-400"
              >
                {t("mileage_starting_odometer_saved")}
              </p>
            )}
          </form>
        </div>
      ) : report.starting_odometer_km != null ? (
        <div className="bg-card rounded-xl shadow-sm p-4 mb-6 flex items-center gap-2 text-sm">
          <Gauge
            className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <span className="text-muted">{t("mileage_starting_odometer")}:</span>
          <span className="font-semibold text-foreground">
            {report.starting_odometer_km.toFixed(1)} km →{" "}
            {(report.starting_odometer_km + totalKm).toFixed(1)} km
          </span>
        </div>
      ) : null}

      {/* Add button */}
      {canEdit && (
        <div className="mb-6">
          <button
            type="button"
            onClick={(e) => handleOpenCreateModal(undefined, e.currentTarget)}
            className="inline-flex items-center gap-2 min-h-11 px-4 py-2 text-sm font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />{" "}
            {t("mileage_add_trip")}
          </button>
        </div>
      )}

      {/* Weekly mileage trips */}
      <MileageWeeklyList
        weeks={weeks}
        totalRecords={records.length}
        totalKm={totalKm}
        totalDuration={totalDuration}
        totalGross={totalGross}
        totalNet={totalNet}
        canEdit={canEdit}
        locale={locale}
        copiedTrip={copiedTrip}
        pastingDates={pastingDates}
        mutatingDisabled={mutatingDisabled}
        highlightedTripId={highlightedTripId}
        collapsedWeeks={collapsedWeeks}
        pasteNotice={pasteNotice}
        pasteError={pasteError}
        onToggleWeek={handleToggleWeek}
        onEditTrip={handleOpenEditModal}
        onCopyTrip={handleCopyTrip}
        onClearClipboard={handleClearClipboard}
        onPasteToDates={(dates) => void handlePasteToDates(dates)}
        onAddForDay={(dateKey, triggerEl) =>
          handleOpenCreateModal(dateKey, triggerEl)
        }
        onDeleteTrip={confirmDeleteMileage}
        onAddPreviousWeek={handleAddPreviousWeek}
        onAddNextWeek={handleAddNextWeek}
      />

      {/* Unified Create / Edit Trip Modal (mounted whenever modalState !== null) */}
      {modalState !== null && (
        <MileageTripModal
          key={
            modalState.mode === "edit"
              ? `edit-${modalState.trip.id}`
              : `create-${modalState.initialDateKey ?? "default"}`
          }
          mode={modalState.mode}
          initialDateKey={
            modalState.mode === "create"
              ? modalState.initialDateKey
              : undefined
          }
          trip={modalState.mode === "edit" ? modalState.trip : undefined}
          vehicles={vehicles}
          vehiclesLoading={vehiclesLoading}
          vehiclesError={vehiclesError}
          isPending={addMileage.isPending || editMileage.isPending}
          onClose={closeModalAndRestoreFocus}
          onCreate={async (payload) => {
            await addMileage.mutateAsync(payload);
          }}
          onUpdate={async (mileageId, payload) => {
            const previousDayKey =
              modalState.mode === "edit"
                ? isoToLocalDateKey(modalState.trip.start_time)
                : "";
            await editMileage.mutateAsync({
              mileageId,
              payload,
              previousDayKey,
            });
          }}
        />
      )}
    </AppShell>
  );
}
