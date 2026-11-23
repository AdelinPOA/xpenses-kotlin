"use client";

import { Fragment } from "react";
import {
  ArrowLeftRight,
  Calendar,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { MileageRecord } from "@/lib/api";
import { formatAmount, formatDistanceKm } from "@/lib/format";
import { formatFuelSourceShortName } from "@/lib/fuelStatus";
import { LOCALE_TO_INTL, type Locale } from "@/i18n/config";
import {
  formatDayHeading,
  formatDuration,
  formatTripTimeRange,
  formatWeekRange,
  getWorkdayPasteTargets,
  type MileageWeekGroup,
} from "@/lib/mileageWeeks";

interface MileageWeeklyListProps {
  weeks: MileageWeekGroup<MileageRecord>[];
  totalRecords: number;
  totalKm: number;
  totalDuration: number;
  totalGross: number;
  totalNet: number;
  canEdit: boolean;
  locale: Locale;
  copiedTrip: MileageRecord | null;
  pastingDates: ReadonlySet<string>;
  mutatingDisabled: boolean;
  highlightedTripId: number | null;
  collapsedWeeks: Readonly<Record<string, boolean>>;
  pasteNotice: string | null;
  pasteError: string | null;
  onToggleWeek: (weekStartKey: string) => void;
  onEditTrip: (trip: MileageRecord, triggerEl: HTMLElement | null) => void;
  onCopyTrip: (trip: MileageRecord) => void;
  onClearClipboard: () => void;
  onPasteToDates: (dateKeys: string[]) => void;
  onAddForDay: (dateKey: string, triggerEl: HTMLElement | null) => void;
  onDeleteTrip: (mileageId: number) => void;
  onAddPreviousWeek: () => void;
  onAddNextWeek: () => void;
}

/** Shared badges for round-trip status and assigned vehicle snapshot. */
function TripMetaPills({
  roundTrip,
  vehiclePlate,
  vehicleMakeModel,
  roundTripLabel,
  normalVehicleWeight = false,
}: {
  roundTrip: boolean;
  vehiclePlate: string | null;
  vehicleMakeModel: string | null;
  roundTripLabel: string;
  normalVehicleWeight?: boolean;
}) {
  if (!roundTrip && !vehiclePlate) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {roundTrip && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
          <ArrowLeftRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{roundTripLabel}</span>
        </span>
      )}
      {vehiclePlate && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${normalVehicleWeight ? "font-normal" : "font-medium"} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300`}
        >
          <Car className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>
            {vehiclePlate}
            {vehicleMakeModel ? ` · ${vehicleMakeModel}` : ""}
          </span>
        </span>
      )}
    </div>
  );
}

/** Shared Edit / Copy / Delete controls for desktop table rows and mobile trip cards. */
function TripRowActions({
  trip,
  isCopied,
  disabled,
  variant,
  editLabel,
  copyLabel,
  copiedLabel,
  deleteLabel,
  editAriaLabel,
  copyAriaLabel,
  deleteAriaLabel,
  onEdit,
  onCopy,
  onDelete,
}: {
  trip: MileageRecord;
  isCopied: boolean;
  disabled: boolean;
  variant: "desktop" | "mobile";
  editLabel: string;
  copyLabel: string;
  copiedLabel: string;
  deleteLabel: string;
  editAriaLabel: string;
  copyAriaLabel: string;
  deleteAriaLabel: string;
  onEdit: (trip: MileageRecord, triggerEl: HTMLElement | null) => void;
  onCopy: (trip: MileageRecord) => void;
  onDelete: (mileageId: number) => void;
}) {
  if (variant === "mobile") {
    return (
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(e) => onEdit(trip, e.currentTarget)}
            disabled={disabled}
            aria-label={editAriaLabel}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 py-2 rounded-lg text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{editLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => onCopy(trip)}
            aria-label={copyAriaLabel}
            className={`inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              isCopied
                ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
                : "text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/30 hover:text-teal-700 dark:hover:text-teal-300"
            }`}
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{isCopied ? copiedLabel : copyLabel}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDelete(trip.id)}
          disabled={disabled}
          aria-label={deleteAriaLabel}
          className="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{deleteLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={(e) => onEdit(trip, e.currentTarget)}
        disabled={disabled}
        title={editAriaLabel}
        aria-label={editAriaLabel}
        className="p-1.5 rounded-md text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Pencil className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onCopy(trip)}
        title={copyAriaLabel}
        aria-label={copyAriaLabel}
        className={`p-1.5 rounded-md cursor-pointer transition-colors ${
          isCopied
            ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
            : "text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30"
        }`}
      >
        {isCopied ? (
          <Check className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onDelete(trip.id)}
        disabled={disabled}
        title={deleteAriaLabel}
        aria-label={deleteAriaLabel}
        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Per-day Paste and Add actions shared between mobile, empty-week, and table day headers. */
function DayActionControls({
  dateKey,
  hasCopiedTrip,
  isPasting,
  pasteLabel,
  pastingLabel,
  addLabel,
  onPaste,
  onAdd,
}: {
  dateKey: string;
  hasCopiedTrip: boolean;
  isPasting: boolean;
  pasteLabel: string;
  pastingLabel: string;
  addLabel: string;
  onPaste: (dateKey: string) => void;
  onAdd: (dateKey: string, triggerEl: HTMLElement | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {hasCopiedTrip && (
        <button
          type="button"
          onClick={() => onPaste(dateKey)}
          disabled={isPasting}
          className="inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-md text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {isPasting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <ClipboardPaste className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{isPasting ? pastingLabel : pasteLabel}</span>
        </button>
      )}
      <button
        type="button"
        onClick={(e) => onAdd(dateKey, e.currentTarget)}
        title={addLabel}
        aria-label={addLabel}
        className="inline-flex items-center justify-center min-h-8 min-w-8 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/70 dark:hover:bg-teal-950/30 cursor-pointer transition-colors"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Weekly-grouped mileage trip list with owner+draft Edit, Copy/Paste, and Mon-Fri bulk paste. */
export default function MileageWeeklyList({
  weeks,
  totalRecords,
  totalKm,
  totalDuration,
  totalGross,
  totalNet,
  canEdit,
  locale,
  copiedTrip,
  pastingDates,
  mutatingDisabled,
  highlightedTripId,
  collapsedWeeks,
  pasteNotice,
  pasteError,
  onToggleWeek,
  onEditTrip,
  onCopyTrip,
  onClearClipboard,
  onPasteToDates,
  onAddForDay,
  onDeleteTrip,
  onAddPreviousWeek,
  onAddNextWeek,
}: MileageWeeklyListProps) {
  const t = useTranslations("reports");
  const intlLocale = LOCALE_TO_INTL[locale];

  const copiedTimeRange = copiedTrip
    ? formatTripTimeRange(copiedTrip.start_time, copiedTrip.end_time, intlLocale)
    : null;

  return (
    <div>
      {/* Sticky clipboard bar */}
      {canEdit && copiedTrip && copiedTimeRange && (
        <div className="sticky top-2 z-20 mb-4 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/95 dark:bg-teal-950/95 backdrop-blur-sm shadow-md p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-teal-800 dark:text-teal-200">
                  <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t("mileage_clipboard_label")}</span>
                </span>
                <span className="font-medium text-foreground">
                  {copiedTrip.origin} → {copiedTrip.destination}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border border-teal-200 dark:border-teal-800">
                  {formatDistanceKm(copiedTrip.distance_km)} {t("mileage_km")}
                </span>
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {copiedTimeRange.startLabel} – {copiedTimeRange.endLabel}
                  {copiedTimeRange.dayOffset > 0 && (
                    <span className="ml-1 text-[11px] font-medium text-teal-700 dark:text-teal-300">
                      ({t("mileage_next_day_suffix", { days: copiedTimeRange.dayOffset })})
                    </span>
                  )}
                </span>
              </div>
              <TripMetaPills
                roundTrip={copiedTrip.round_trip}
                vehiclePlate={copiedTrip.vehicle_plate}
                vehicleMakeModel={copiedTrip.vehicle_make_model}
                roundTripLabel={t("mileage_round_trip")}
              />
              <p className="text-xs text-teal-800/80 dark:text-teal-200/80 mt-1.5">
                {t("mileage_clipboard_hint")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearClipboard}
              className="inline-flex items-center gap-1 self-start px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-white/80 dark:bg-slate-900/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 cursor-pointer transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t("mileage_clipboard_clear")}</span>
            </button>
          </div>
          {pasteNotice && (
            <p
              role="status"
              className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"
            >
              {pasteNotice}
            </p>
          )}
          {pasteError && (
            <p
              role="alert"
              className="mt-2 text-xs font-medium text-red-700 dark:text-red-300"
            >
              {pasteError}
            </p>
          )}
        </div>
      )}

      {/* Fallback alert when clipboard is closed or non-editable */}
      {(!canEdit || !copiedTrip) && pasteError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
        >
          {pasteError}
        </p>
      )}

      {/* Section toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t("mileage_trips")} ({totalRecords})
        </h2>
        {canEdit && weeks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddPreviousWeek}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-input-border bg-card text-slate-700 dark:text-slate-200 hover:bg-card-hover cursor-pointer transition-colors"
            >
              {t("mileage_week_prev")}
            </button>
            <button
              type="button"
              onClick={onAddNextWeek}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-input-border bg-card text-slate-700 dark:text-slate-200 hover:bg-card-hover cursor-pointer transition-colors"
            >
              {t("mileage_week_next")}
            </button>
          </div>
        )}
      </div>

      {/* Empty non-editable state */}
      {weeks.length === 0 ? (
        <div className="bg-card rounded-xl shadow-sm">
          <p className="p-6 text-sm text-muted-foreground text-center">
            {t("mileage_no_records")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {weeks.map((week) => {
            const isCollapsed = Boolean(collapsedWeeks[week.weekStartKey]);
            const tripCountLabel =
              week.records.length === 1
                ? t("mileage_week_trip_one")
                : t("mileage_week_trips_other", { count: week.records.length });
            const workdayTargets =
              canEdit && copiedTrip ? getWorkdayPasteTargets(week, copiedTrip) : [];
            const isAnyWorkdayPasting = workdayTargets.some((dateKey) =>
              pastingDates.has(dateKey),
            );
            const desktopColCount = canEdit ? 10 : 9;

            return (
              <section
                key={week.weekStartKey}
                className="bg-card rounded-xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-700/70"
              >
                {/* Week Header Bar */}
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleWeek(week.weekStartKey)}
                      aria-label={t("mileage_week_toggle")}
                      aria-expanded={!isCollapsed}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 cursor-pointer transition-colors shrink-0"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                    <Calendar
                      className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-foreground">
                      {t("mileage_week_title", { week: week.isoWeek })} ·{" "}
                      {formatWeekRange(week.weekStartKey, week.weekEndKey, intlLocale)}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {tripCountLabel}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 pl-9 lg:pl-0">
                    {week.records.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {formatDistanceKm(week.totalKm)} {t("mileage_km")}
                        </span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {formatDuration(week.totalDurationMinutes)}
                        </span>
                        <span className="text-muted-foreground">
                          {t("mileage_gross_prefix")} {formatAmount(week.totalGross, "EUR")}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatAmount(week.totalNet, "EUR")}
                        </span>
                      </div>
                    )}

                    {canEdit && copiedTrip && (
                      workdayTargets.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onPasteToDates(workdayTargets)}
                          disabled={isAnyWorkdayPasting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
                        >
                          {isAnyWorkdayPasting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                          ) : (
                            <ClipboardPaste className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            {t("mileage_paste_workdays", { count: workdayTargets.length })}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{t("mileage_paste_workdays_done")}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Week Body */}
                {!isCollapsed && (
                  <>
                    {/* Mobile: day-grouped stacked cards */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
                      {week.days.map((day) => {
                        const { weekday, shortDate } = formatDayHeading(
                          day.dateKey,
                          intlLocale,
                        );
                        const dayTint = day.isWeekend
                          ? "bg-slate-50/70 dark:bg-slate-800/40"
                          : "bg-slate-50/30 dark:bg-slate-800/20";

                        return (
                          <div key={day.dateKey}>
                            <div
                              className={`px-4 py-2 flex items-center justify-between gap-2 ${dayTint}`}
                            >
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span
                                  className={`text-xs font-semibold ${day.inReportRange ? "text-slate-700 dark:text-slate-200" : "text-muted-foreground"}`}
                                >
                                  {weekday}, {shortDate}
                                </span>
                                {day.records.length === 0 && (
                                  <span className="text-xs text-muted-foreground italic">
                                    {t("mileage_day_empty")}
                                  </span>
                                )}
                              </div>
                              {canEdit && (
                                <DayActionControls
                                  dateKey={day.dateKey}
                                  hasCopiedTrip={copiedTrip != null}
                                  isPasting={pastingDates.has(day.dateKey)}
                                  pasteLabel={t("mileage_paste_day")}
                                  pastingLabel={t("mileage_pasting")}
                                  addLabel={t("mileage_day_add")}
                                  onPaste={(d) => onPasteToDates([d])}
                                  onAdd={onAddForDay}
                                />
                              )}
                            </div>

                            {day.records.map((m) => {
                              const timeRange = formatTripTimeRange(
                                m.start_time,
                                m.end_time,
                                intlLocale,
                              );
                              const isCopied = copiedTrip?.id === m.id;
                              const isHighlighted = highlightedTripId === m.id;
                              return (
                                <div
                                  key={m.id}
                                  className={`p-4 border-t border-slate-100 dark:border-slate-700 transition-colors duration-300 ${
                                    isHighlighted
                                      ? "bg-emerald-50/80 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-300 dark:ring-emerald-700"
                                      : isCopied
                                        ? "bg-teal-50/50 dark:bg-teal-950/20"
                                        : ""
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground">
                                        {m.origin} → {m.destination}
                                      </p>
                                      <p className="text-xs text-muted mt-0.5">
                                        {timeRange.startLabel} – {timeRange.endLabel}
                                        {timeRange.dayOffset > 0 && (
                                          <span className="ml-1 font-medium text-teal-600 dark:text-teal-400">
                                            ({t("mileage_next_day_suffix", { days: timeRange.dayOffset })})
                                          </span>
                                        )}
                                      </p>
                                      <TripMetaPills
                                        roundTrip={m.round_trip}
                                        vehiclePlate={m.vehicle_plate}
                                        vehicleMakeModel={m.vehicle_make_model}
                                        roundTripLabel={t("mileage_round_trip")}
                                      />
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="font-semibold text-foreground">
                                        {formatAmount(m.amount_eur, "EUR")}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatDistanceKm(m.distance_km)} {t("mileage_km")}
                                      </p>
                                    </div>
                                  </div>
                                  {m.description && (
                                    <p className="text-sm text-muted mt-2">
                                      {m.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2.5">
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                                      {formatDuration(m.duration_minutes)}
                                    </span>
                                    <span>
                                      {t("mileage_gross_prefix")}{" "}
                                      {formatAmount(m.amount_before_tax, "EUR")}
                                    </span>
                                  </div>
                                  {m.fuel_cost_eur != null && (
                                    <details className="mt-2 text-xs text-muted-foreground">
                                      <summary className="cursor-pointer">
                                        {t("mileage_calc_details")}
                                      </summary>
                                      <p className="mt-1">
                                        {t("mileage_calc_fuel")}:{" "}
                                        {m.fuel_cost_eur.toFixed(2)} EUR
                                        {m.fuel_price_ron_per_liter != null && (
                                          <span>
                                            {" "}
                                            ({m.fuel_price_ron_per_liter.toFixed(2)} RON/L
                                            {m.fuel_price_source
                                              ? ` · ${formatFuelSourceShortName(m.fuel_price_source)}`
                                              : ""}
                                            )
                                          </span>
                                        )}{" "}
                                        · {t("mileage_calc_taxable")}:{" "}
                                        {(m.taxable_amount ?? 0).toFixed(2)} EUR ·{" "}
                                        {t("mileage_calc_withholding")}:{" "}
                                        {(m.withholding_amount ?? 0).toFixed(2)} EUR
                                      </p>
                                    </details>
                                  )}
                                  {canEdit && (
                                    <TripRowActions
                                      trip={m}
                                      isCopied={isCopied}
                                      disabled={mutatingDisabled}
                                      variant="mobile"
                                      editLabel={t("mileage_action_edit")}
                                      copyLabel={t("mileage_action_copy")}
                                      copiedLabel={t("mileage_copied_badge")}
                                      deleteLabel={t("mileage_action_delete")}
                                      editAriaLabel={t("mileage_edit_trip_aria", {
                                        origin: m.origin,
                                        destination: m.destination,
                                      })}
                                      copyAriaLabel={t("mileage_copy_trip_aria", {
                                        origin: m.origin,
                                        destination: m.destination,
                                      })}
                                      deleteAriaLabel={t("mileage_delete_trip_aria", {
                                        origin: m.origin,
                                        destination: m.destination,
                                      })}
                                      onEdit={onEditTrip}
                                      onCopy={onCopyTrip}
                                      onDelete={onDeleteTrip}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: compact empty-week rows OR full table */}
                    <div className="hidden md:block">
                      {week.records.length === 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {week.days.map((day) => {
                            const { weekday, shortDate } = formatDayHeading(
                              day.dateKey,
                              intlLocale,
                            );
                            const dayTint = day.isWeekend
                              ? "bg-slate-50/70 dark:bg-slate-800/40"
                              : "";
                            return (
                              <div
                                key={day.dateKey}
                                className={`px-4 py-2 flex items-center justify-between gap-3 ${dayTint}`}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`text-xs font-semibold ${day.inReportRange ? "text-slate-700 dark:text-slate-200" : "text-muted-foreground"}`}
                                  >
                                    {weekday}, {shortDate}
                                  </span>
                                  <span className="text-xs text-muted-foreground italic">
                                    {t("mileage_day_empty")}
                                  </span>
                                </div>
                                {canEdit && (
                                  <DayActionControls
                                    dateKey={day.dateKey}
                                    hasCopiedTrip={copiedTrip != null}
                                    isPasting={pastingDates.has(day.dateKey)}
                                    pasteLabel={t("mileage_paste_day")}
                                    pastingLabel={t("mileage_pasting")}
                                    addLabel={t("mileage_day_add")}
                                    onPaste={(d) => onPasteToDates([d])}
                                    onAdd={onAddForDay}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50/70 dark:bg-slate-800/50 text-xs text-muted uppercase border-b border-slate-100 dark:border-slate-700">
                              <tr>
                                <th className="text-left px-4 py-2.5">
                                  {t("mileage_table_time")}
                                </th>
                                <th className="text-left px-4 py-2.5">
                                  {t("mileage_table_duration")}
                                </th>
                                <th className="text-left px-4 py-2.5">
                                  {t("mileage_table_route")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_km")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_rate_bt")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_gross")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_rate_at")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_net")}
                                </th>
                                <th className="text-right px-4 py-2.5">
                                  {t("mileage_table_fuel_deduction")}
                                </th>
                                {canEdit && (
                                  <th className="text-right px-4 py-2.5">
                                    {t("mileage_table_actions")}
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {week.days.map((day) => {
                                const { weekday, shortDate } = formatDayHeading(
                                  day.dateKey,
                                  intlLocale,
                                );
                                const dayRowBg = day.isWeekend
                                  ? "bg-slate-50/80 dark:bg-slate-800/50"
                                  : "bg-slate-50/40 dark:bg-slate-800/25";

                                return (
                                  <Fragment key={day.dateKey}>
                                    <tr
                                      className={`border-t border-slate-100 dark:border-slate-700 ${dayRowBg}`}
                                    >
                                      <td colSpan={desktopColCount} className="px-4 py-1.5">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-3">
                                            <span
                                              className={`text-xs font-semibold ${day.inReportRange ? "text-slate-700 dark:text-slate-200" : "text-muted-foreground"}`}
                                            >
                                              {weekday}, {shortDate}
                                            </span>
                                            {day.records.length === 0 && (
                                              <span className="text-xs text-muted-foreground italic">
                                                {t("mileage_day_empty")}
                                              </span>
                                            )}
                                          </div>
                                          {canEdit && (
                                            <DayActionControls
                                              dateKey={day.dateKey}
                                              hasCopiedTrip={copiedTrip != null}
                                              isPasting={pastingDates.has(day.dateKey)}
                                              pasteLabel={t("mileage_paste_day")}
                                              pastingLabel={t("mileage_pasting")}
                                              addLabel={t("mileage_day_add")}
                                              onPaste={(d) => onPasteToDates([d])}
                                              onAdd={onAddForDay}
                                            />
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                    {day.records.map((m) => {
                                      const timeRange = formatTripTimeRange(
                                        m.start_time,
                                        m.end_time,
                                        intlLocale,
                                      );
                                      const isCopied = copiedTrip?.id === m.id;
                                      const isHighlighted = highlightedTripId === m.id;
                                      return (
                                        <tr
                                          key={m.id}
                                          className={`border-t border-slate-100 dark:border-slate-700 transition-colors duration-300 ${
                                            isHighlighted
                                              ? "bg-emerald-50/80 dark:bg-emerald-950/30"
                                              : isCopied
                                                ? "bg-teal-50/50 dark:bg-teal-950/20"
                                                : ""
                                          }`}
                                        >
                                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                            <span>
                                              {timeRange.startLabel} – {timeRange.endLabel}
                                            </span>
                                            {timeRange.dayOffset > 0 && (
                                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                                                {t("mileage_next_day_suffix", {
                                                  days: timeRange.dayOffset,
                                                })}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">
                                            {formatDuration(m.duration_minutes)}
                                          </td>
                                          <td className="px-4 py-3 font-medium text-foreground">
                                            <div>
                                              {m.origin} → {m.destination}
                                            </div>
                                            <TripMetaPills
                                              roundTrip={m.round_trip}
                                              vehiclePlate={m.vehicle_plate}
                                              vehicleMakeModel={m.vehicle_make_model}
                                              roundTripLabel={t("mileage_round_trip")}
                                              normalVehicleWeight
                                            />
                                            {m.description && (
                                              <span className="block text-xs text-muted-foreground mt-0.5">
                                                {m.description}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                            {formatDistanceKm(m.distance_km)}
                                          </td>
                                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                                            {formatAmount(m.rate_before_tax, "EUR")}
                                          </td>
                                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                            {formatAmount(m.amount_before_tax, "EUR")}
                                          </td>
                                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                                            {formatAmount(m.rate_after_tax, "EUR")}
                                          </td>
                                          <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">
                                            {formatAmount(m.amount_eur, "EUR")}
                                          </td>
                                          <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                                            {m.fuel_cost_eur != null ? (
                                              <div>
                                                <div>{m.fuel_cost_eur.toFixed(2)} EUR</div>
                                                {m.fuel_price_ron_per_liter != null && (
                                                  <div className="text-[11px] opacity-80">
                                                    {m.fuel_price_ron_per_liter.toFixed(2)} RON/L
                                                    {m.fuel_price_source
                                                      ? ` · ${formatFuelSourceShortName(m.fuel_price_source)}`
                                                      : ""}
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                          {canEdit && (
                                            <td className="px-4 py-3 text-right">
                                              <TripRowActions
                                                trip={m}
                                                isCopied={isCopied}
                                                disabled={mutatingDisabled}
                                                variant="desktop"
                                                editLabel={t("mileage_action_edit")}
                                                copyLabel={t("mileage_action_copy")}
                                                copiedLabel={t("mileage_copied_badge")}
                                                deleteLabel={t("mileage_action_delete")}
                                                editAriaLabel={t("mileage_edit_trip_aria", {
                                                  origin: m.origin,
                                                  destination: m.destination,
                                                })}
                                                copyAriaLabel={t("mileage_copy_trip_aria", {
                                                  origin: m.origin,
                                                  destination: m.destination,
                                                })}
                                                deleteAriaLabel={t("mileage_delete_trip_aria", {
                                                  origin: m.origin,
                                                  destination: m.destination,
                                                })}
                                                onEdit={onEditTrip}
                                                onCopy={onCopyTrip}
                                                onDelete={onDeleteTrip}
                                              />
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}

          {/* Grand Total Card */}
          {totalRecords > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {t("mileage_total")}
                </span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {formatDuration(totalDuration)}
                </span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {formatDistanceKm(totalKm)} {t("mileage_km")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {t("mileage_gross_prefix")} {formatAmount(totalGross, "EUR")}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatAmount(totalNet, "EUR")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
