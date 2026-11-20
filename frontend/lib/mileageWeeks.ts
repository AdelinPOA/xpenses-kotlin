export interface MileageTripLike {
  id: number;
  origin: string;
  destination: string;
  distance_km: number;
  amount_before_tax: number;
  amount_eur: number;
  duration_minutes: number;
  start_time: string;
  end_time: string;
  description: string | null;
  round_trip: boolean;
  vehicle_id: number | null;
}

export interface MileageCreatePayload {
  origin: string;
  destination: string;
  distance_km: number;
  start_time: string;
  end_time: string;
  round_trip: boolean;
  description?: string;
  vehicle_id?: number;
}

export interface MileageDayGroup<T extends MileageTripLike = MileageTripLike> {
  dateKey: string;
  dayOfWeek: number;
  isWeekend: boolean;
  inReportRange: boolean;
  records: T[];
}

export interface MileageWeekGroup<T extends MileageTripLike = MileageTripLike> {
  weekStartKey: string;
  weekEndKey: string;
  isoWeek: number;
  isoWeekYear: number;
  days: MileageDayGroup<T>[];
  records: T[];
  totalKm: number;
  totalDurationMinutes: number;
  totalGross: number;
  totalNet: number;
}

export interface BuildMileageWeeksOptions<T extends MileageTripLike = MileageTripLike> {
  records: T[];
  dateFrom?: string | null;
  dateTo?: string | null;
  includeEmptyDays: boolean;
  extraWeekStarts?: string[];
  fallbackTodayKey?: string;
  maxSpanWeeks?: number;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_LOCAL_INPUT_PATTERN = /T(\d{2}:\d{2})/;
const MS_PER_DAY = 86_400_000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Parse and validate a `YYYY-MM-DD` calendar key without UTC midnight coercion. */
export function parseDateKey(
  dateKey: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Format a local Date object into a `YYYY-MM-DD` key. */
export function toLocalDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Convert an ISO timestamp string into a local `YYYY-MM-DD` calendar key. */
export function isoToLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return toLocalDateKey(d);
}

/** Extract a valid local `YYYY-MM-DD` key from a date-only string or ISO timestamp. */
export function extractDateKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (DATE_KEY_PATTERN.test(trimmed)) {
    return parseDateKey(trimmed) ? trimmed : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
}

/** Construct a local-midnight Date from a validated `YYYY-MM-DD` key. */
export function dateKeyToLocalDate(dateKey: string): Date {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

/** Add a signed number of calendar days to a `YYYY-MM-DD` key. */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return toLocalDateKey(new Date(parsed.year, parsed.month - 1, parsed.day + deltaDays));
}

/** Return the Monday `YYYY-MM-DD` key for the ISO week containing `dateKey`. */
export function getMondayDateKey(dateKey: string): string {
  const d = dateKeyToLocalDate(dateKey);
  const offsetFromMonday = (d.getDay() + 6) % 7;
  return addDaysToDateKey(dateKey, -offsetFromMonday);
}

/** Compute the ISO-8601 week number and week-numbering year for a `YYYY-MM-DD` key. */
export function getIsoWeekInfo(
  dateKey: string,
): { isoWeek: number; isoWeekYear: number } {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  // Shift in UTC to the Thursday of the same ISO week to avoid DST and year-boundary drift.
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const isoDay = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - isoDay);
  const isoWeekYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoWeekYear, 0, 1));
  const isoWeek = Math.ceil(((utc.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return { isoWeek, isoWeekYear };
}

/** Group mileage records into sorted Monday–Sunday ISO week structures. */
export function buildMileageWeeks<T extends MileageTripLike>(
  options: BuildMileageWeeksOptions<T>,
): MileageWeekGroup<T>[] {
  const maxSpanWeeks = options.maxSpanWeeks ?? 26;

  const sortedRecords = [...options.records].sort((a, b) => {
    const diff = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    if (diff !== 0) return diff;
    return a.id - b.id;
  });

  const recordsByDay = new Map<string, T[]>();
  for (const record of sortedRecords) {
    if (Number.isNaN(new Date(record.start_time).getTime())) continue;
    const dayKey = isoToLocalDateKey(record.start_time);
    const existing = recordsByDay.get(dayKey);
    if (existing) {
      existing.push(record);
    } else {
      recordsByDay.set(dayKey, [record]);
    }
  }

  const rangeStart = extractDateKey(options.dateFrom);
  const rangeEnd = extractDateKey(options.dateTo);
  const hasValidRange = rangeStart != null && rangeEnd != null && rangeStart <= rangeEnd;

  const weekStarts = new Set<string>();
  for (const dayKey of recordsByDay.keys()) {
    weekStarts.add(getMondayDateKey(dayKey));
  }

  if (options.includeEmptyDays) {
    if (hasValidRange && rangeStart && rangeEnd) {
      let cursor = getMondayDateKey(rangeStart);
      const endMonday = getMondayDateKey(rangeEnd);
      let weekCount = 0;
      while (cursor <= endMonday && weekCount < maxSpanWeeks) {
        weekStarts.add(cursor);
        cursor = addDaysToDateKey(cursor, 7);
        weekCount += 1;
      }
      if (cursor <= endMonday) {
        weekStarts.add(endMonday);
      }
    } else if (rangeStart) {
      weekStarts.add(getMondayDateKey(rangeStart));
    } else if (rangeEnd) {
      weekStarts.add(getMondayDateKey(rangeEnd));
    }

    for (const extra of options.extraWeekStarts ?? []) {
      const extraKey = extractDateKey(extra);
      if (extraKey) {
        weekStarts.add(getMondayDateKey(extraKey));
      }
    }

    if (weekStarts.size === 0) {
      const fallback = extractDateKey(options.fallbackTodayKey) ?? toLocalDateKey(new Date());
      weekStarts.add(getMondayDateKey(fallback));
    }
  }

  const orderedWeekStarts = [...weekStarts].sort();
  const weeks: MileageWeekGroup<T>[] = [];

  for (const weekStartKey of orderedWeekStarts) {
    const allDays: MileageDayGroup<T>[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const dateKey = addDaysToDateKey(weekStartKey, offset);
      const dayOfWeek = offset + 1;
      const inReportRange =
        hasValidRange && rangeStart && rangeEnd
          ? dateKey >= rangeStart && dateKey <= rangeEnd
          : true;
      allDays.push({
        dateKey,
        dayOfWeek,
        isWeekend: dayOfWeek >= 6,
        inReportRange,
        records: recordsByDay.get(dateKey) ?? [],
      });
    }

    const days = options.includeEmptyDays
      ? allDays
      : allDays.filter((day) => day.records.length > 0);
    if (days.length === 0) continue;

    const records = days.flatMap((day) => day.records);
    const { isoWeek, isoWeekYear } = getIsoWeekInfo(weekStartKey);

    weeks.push({
      weekStartKey,
      weekEndKey: addDaysToDateKey(weekStartKey, 6),
      isoWeek,
      isoWeekYear,
      days,
      records,
      totalKm: records.reduce((sum, r) => sum + r.distance_km, 0),
      totalDurationMinutes: records.reduce((sum, r) => sum + r.duration_minutes, 0),
      totalGross: records.reduce((sum, r) => sum + r.amount_before_tax, 0),
      totalNet: records.reduce((sum, r) => sum + r.amount_eur, 0),
    });
  }

  return weeks;
}

/** Shift a source trip's local start time and exact duration onto `targetDateKey`. */
export function shiftTripToDate(
  source: Pick<MileageTripLike, "start_time" | "end_time">,
  targetDateKey: string,
): { start_time: string; end_time: string } {
  const srcStart = new Date(source.start_time);
  const srcEnd = new Date(source.end_time);
  const durationMs = srcEnd.getTime() - srcStart.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Trip end_time must be after start_time");
  }

  const parsed = parseDateKey(targetDateKey);
  if (!parsed) {
    throw new Error(`Invalid target date key: ${targetDateKey}`);
  }

  const newStart = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    srcStart.getHours(),
    srcStart.getMinutes(),
    srcStart.getSeconds(),
    srcStart.getMilliseconds(),
  );
  const newEnd = new Date(newStart.getTime() + durationMs);

  return {
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
  };
}

/** Build the POST payload to paste a copied trip onto `targetDateKey`. */
export function buildPastePayload(
  source: MileageTripLike,
  targetDateKey: string,
  validVehicleIds?: ReadonlySet<number> | null,
): MileageCreatePayload {
  const { start_time, end_time } = shiftTripToDate(source, targetDateKey);
  const trimmedDesc = source.description?.trim();
  const canUseVehicle =
    source.vehicle_id != null &&
    (validVehicleIds == null || validVehicleIds.has(source.vehicle_id));

  return {
    origin: source.origin,
    destination: source.destination,
    distance_km: source.distance_km,
    start_time,
    end_time,
    round_trip: source.round_trip,
    ...(trimmedDesc ? { description: trimmedDesc } : {}),
    ...(canUseVehicle && source.vehicle_id != null ? { vehicle_id: source.vehicle_id } : {}),
  };
}

/** Return local `HH:mm` for an ISO timestamp. */
export function getLocalHHmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Detect whether a day already contains a trip with the same route, start HH:mm, and round-trip flag. */
export function hasMatchingTripOnDay(
  dayRecords: readonly MileageTripLike[],
  source: MileageTripLike,
): boolean {
  const srcOrigin = source.origin.trim().toLowerCase();
  const srcDestination = source.destination.trim().toLowerCase();
  const srcStart = getLocalHHmm(source.start_time);

  return dayRecords.some(
    (record) =>
      record.origin.trim().toLowerCase() === srcOrigin &&
      record.destination.trim().toLowerCase() === srcDestination &&
      getLocalHHmm(record.start_time) === srcStart &&
      record.round_trip === source.round_trip,
  );
}

/** Return Mon–Fri date keys in `week` that do not already contain a matching trip. */
export function getWorkdayPasteTargets<T extends MileageTripLike>(
  week: MileageWeekGroup<T>,
  source: MileageTripLike,
): string[] {
  return week.days
    .filter((day) => !day.isWeekend && !hasMatchingTripOnDay(day.records, source))
    .map((day) => day.dateKey);
}

/** Format a duration in minutes as `Xh YYm`, rounding total minutes before splitting hours. */
export function formatDuration(minutes: number): string {
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${pad2(mins)}m`;
}

/** Format a trip's local start–end 24h time range plus any local calendar day offset. */
export function formatTripTimeRange(
  startIso: string,
  endIso: string,
  intlLocale: string,
): { startLabel: string; endLabel: string; dayOffset: number } {
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  const timeFmt = new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const startUtcDay = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const endUtcDay = Date.UTC(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );

  return {
    startLabel: timeFmt.format(startDate),
    endLabel: timeFmt.format(endDate),
    dayOffset: Math.round((endUtcDay - startUtcDay) / MS_PER_DAY),
  };
}

/** Format a Monday–Sunday week range compactly in `intlLocale`. */
export function formatWeekRange(
  weekStartKey: string,
  weekEndKey: string,
  intlLocale: string,
): string {
  const start = dateKeyToLocalDate(weekStartKey);
  const end = dateKeyToLocalDate(weekEndKey);
  const fullFmt = new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${start.getDate()} – ${fullFmt.format(end)}`;
  }

  if (start.getFullYear() === end.getFullYear()) {
    const noYearFmt = new Intl.DateTimeFormat(intlLocale, {
      day: "numeric",
      month: "short",
    });
    return `${noYearFmt.format(start)} – ${fullFmt.format(end)}`;
  }

  return `${fullFmt.format(start)} – ${fullFmt.format(end)}`;
}

/** Format a day's capitalized weekday name and `DD/MM` (or locale `DD.MM`) short date. */
export function formatDayHeading(
  dateKey: string,
  intlLocale: string,
): { weekday: string; shortDate: string } {
  const date = dateKeyToLocalDate(dateKey);
  const rawWeekday = new Intl.DateTimeFormat(intlLocale, {
    weekday: "long",
  }).format(date);
  const weekday = rawWeekday
    ? rawWeekday.charAt(0).toLocaleUpperCase(intlLocale) + rawWeekday.slice(1)
    : rawWeekday;
  const shortDate = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return { weekday, shortDate };
}

/** Build `datetime-local` values for `dateKey`, preserving valid existing `HH:mm` or defaulting to 08:00–08:30. */
export function buildDefaultDateTimeLocal(
  dateKey: string,
  currentStartTime?: string,
  currentEndTime?: string,
): { startTime: string; endTime: string } {
  const startMatch = currentStartTime ? HHMM_LOCAL_INPUT_PATTERN.exec(currentStartTime) : null;
  const endMatch = currentEndTime ? HHMM_LOCAL_INPUT_PATTERN.exec(currentEndTime) : null;

  const hasValidCurrentTimes =
    startMatch != null && endMatch != null && startMatch[1] < endMatch[1];

  const startHHmm = hasValidCurrentTimes ? startMatch[1] : "08:00";
  const endHHmm = hasValidCurrentTimes ? endMatch[1] : "08:30";

  return {
    startTime: `${dateKey}T${startHHmm}`,
    endTime: `${dateKey}T${endHHmm}`,
  };
}
