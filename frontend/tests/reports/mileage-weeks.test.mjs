import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysToDateKey,
  buildDefaultDateTimeLocal,
  buildMileageWeeks,
  buildPastePayload,
  extractDateKey,
  formatDayHeading,
  formatDuration,
  formatTripTimeRange,
  formatWeekRange,
  getIsoWeekInfo,
  getMondayDateKey,
  getWorkdayPasteTargets,
  hasMatchingTripOnDay,
  parseDateKey,
  shiftTripToDate,
} from "../../lib/mileageWeeks.ts";
import {
  buildMileagePatchPayload,
  computeTripDurationPreview,
  detectVehicleSnapshotDrift,
  formatDistanceKm,
  isoToDateTimeLocal,
  parseStrictDecimal,
  shiftEndTimeForStartChange,
} from "../../lib/mileageTripForm.ts";

function localIso(year, month, day, hour, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function makeTrip(overrides = {}) {
  const start = overrides.start_time ?? localIso(2026, 5, 11, 8, 0);
  const end = overrides.end_time ?? localIso(2026, 5, 11, 8, 30);
  return {
    id: 1,
    origin: "Hotel",
    destination: "Factory",
    distance_km: 24.5,
    amount_before_tax: 14.7,
    amount_eur: 9.8,
    duration_minutes: 30,
    start_time: start,
    end_time: end,
    description: "Daily commute",
    round_trip: false,
    vehicle_id: 7,
    ...overrides,
  };
}

test("parseDateKey and extractDateKey validate calendar dates and ISO timestamps", () => {
  assert.deepEqual(parseDateKey("2026-05-11"), { year: 2026, month: 5, day: 11 });
  assert.equal(parseDateKey("2026-02-31"), null);
  assert.equal(parseDateKey("2026-13-01"), null);
  assert.equal(parseDateKey("not-a-date"), null);

  assert.equal(extractDateKey("2026-05-11"), "2026-05-11");
  assert.equal(extractDateKey(" 2026-02-29 "), null);
  assert.equal(extractDateKey(localIso(2026, 5, 14, 17, 45)), "2026-05-14");
  assert.equal(extractDateKey(null), null);
  assert.equal(extractDateKey(""), null);
});

test("getMondayDateKey and getIsoWeekInfo handle weekdays and ISO year boundaries", () => {
  assert.equal(getMondayDateKey("2026-05-11"), "2026-05-11"); // Monday
  assert.equal(getMondayDateKey("2026-05-13"), "2026-05-11"); // Wednesday
  assert.equal(getMondayDateKey("2026-05-17"), "2026-05-11"); // Sunday

  assert.deepEqual(getIsoWeekInfo("2025-12-29"), { isoWeek: 1, isoWeekYear: 2026 });
  assert.deepEqual(getIsoWeekInfo("2026-12-31"), { isoWeek: 53, isoWeekYear: 2026 });
  assert.equal(addDaysToDateKey("2026-05-11", 6), "2026-05-17");
});

test("buildMileageWeeks expands report span into full weeks for draft with totals and range flags", () => {
  const tripTueLater = makeTrip({
    id: 20,
    start_time: localIso(2026, 5, 12, 18, 0),
    end_time: localIso(2026, 5, 12, 18, 45),
    distance_km: 15,
    duration_minutes: 45,
    amount_before_tax: 9,
    amount_eur: 6,
  });
  const tripTueEarlier = makeTrip({
    id: 10,
    start_time: localIso(2026, 5, 12, 8, 0),
    end_time: localIso(2026, 5, 12, 8, 30),
    distance_km: 10,
    duration_minutes: 30,
    amount_before_tax: 6,
    amount_eur: 4,
  });
  const tripWeek2 = makeTrip({
    id: 30,
    start_time: localIso(2026, 5, 20, 9, 0),
    end_time: localIso(2026, 5, 20, 10, 0),
    distance_km: 40,
    duration_minutes: 60,
    amount_before_tax: 24,
    amount_eur: 16,
  });

  const weeks = buildMileageWeeks({
    records: [tripTueLater, tripWeek2, tripTueEarlier],
    dateFrom: "2026-05-12",
    dateTo: "2026-05-22",
    includeEmptyDays: true,
  });

  assert.equal(weeks.length, 2);

  assert.equal(weeks[0].weekStartKey, "2026-05-11");
  assert.equal(weeks[0].weekEndKey, "2026-05-17");
  assert.equal(weeks[0].isoWeek, 20);
  assert.equal(weeks[0].days.length, 7);
  assert.equal(weeks[0].days[0].inReportRange, false); // 2026-05-11 before dateFrom
  assert.equal(weeks[0].days[1].inReportRange, true); // 2026-05-12
  assert.equal(weeks[0].days[5].isWeekend, true);
  assert.equal(weeks[0].days[6].isWeekend, true);
  assert.deepEqual(
    weeks[0].days[1].records.map((r) => r.id),
    [10, 20],
  );
  assert.equal(weeks[0].totalKm, 25);
  assert.equal(weeks[0].totalDurationMinutes, 75);
  assert.equal(weeks[0].totalGross, 15);
  assert.equal(weeks[0].totalNet, 10);

  assert.equal(weeks[1].weekStartKey, "2026-05-18");
  assert.equal(weeks[1].isoWeek, 21);
  assert.equal(weeks[1].days[2].records.length, 1);
  assert.equal(weeks[1].days[5].inReportRange, false); // 2026-05-23 after dateTo
  assert.equal(weeks[1].totalKm, 40);
});

test("buildMileageWeeks handles outliers, maxSpanWeeks cap, fallback today, and extraWeekStarts", () => {
  const outlier = makeTrip({
    id: 99,
    start_time: localIso(2024, 1, 10, 9, 0),
    end_time: localIso(2024, 1, 10, 9, 30),
  });

  const withOutlier = buildMileageWeeks({
    records: [outlier],
    dateFrom: "2026-05-11",
    dateTo: "2026-05-17",
    includeEmptyDays: true,
    extraWeekStarts: ["2026-05-18", "2026-05-11", "2026-05-04"],
  });
  assert.deepEqual(
    withOutlier.map((w) => w.weekStartKey),
    ["2024-01-08", "2026-05-04", "2026-05-11", "2026-05-18"],
  );

  const capped = buildMileageWeeks({
    records: [],
    dateFrom: "2026-01-05",
    dateTo: "2026-12-28",
    includeEmptyDays: true,
    maxSpanWeeks: 3,
  });
  // First 3 weeks + capped endMonday
  assert.deepEqual(
    capped.map((w) => w.weekStartKey),
    ["2026-01-05", "2026-01-12", "2026-01-19", "2026-12-28"],
  );

  const fallback = buildMileageWeeks({
    records: [],
    dateFrom: null,
    dateTo: null,
    includeEmptyDays: true,
    fallbackTodayKey: "2026-05-14",
  });
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].weekStartKey, "2026-05-11");
});

test("buildMileageWeeks omits empty days and empty weeks when includeEmptyDays is false", () => {
  assert.deepEqual(
    buildMileageWeeks({
      records: [],
      dateFrom: "2026-05-11",
      dateTo: "2026-05-17",
      includeEmptyDays: false,
    }),
    [],
  );

  const trip = makeTrip({
    id: 5,
    start_time: localIso(2026, 5, 13, 10, 0),
    end_time: localIso(2026, 5, 13, 10, 40),
  });
  const nonDraft = buildMileageWeeks({
    records: [trip],
    dateFrom: "2026-05-04",
    dateTo: "2026-05-24",
    includeEmptyDays: false,
  });
  assert.equal(nonDraft.length, 1);
  assert.equal(nonDraft[0].days.length, 1);
  assert.equal(nonDraft[0].days[0].dateKey, "2026-05-13");
});

test("shiftTripToDate preserves local start time and exact duration including overnight trips", () => {
  const source = makeTrip({
    start_time: localIso(2026, 5, 11, 8, 15),
    end_time: localIso(2026, 5, 11, 9, 5),
  });
  const shifted = shiftTripToDate(source, "2026-05-14");
  const s = new Date(shifted.start_time);
  const e = new Date(shifted.end_time);
  assert.equal(s.getFullYear(), 2026);
  assert.equal(s.getMonth(), 4);
  assert.equal(s.getDate(), 14);
  assert.equal(s.getHours(), 8);
  assert.equal(s.getMinutes(), 15);
  assert.equal(e.getTime() - s.getTime(), 50 * 60 * 1000);

  const overnight = makeTrip({
    start_time: localIso(2026, 5, 11, 23, 0),
    end_time: localIso(2026, 5, 12, 0, 30),
  });
  const shiftedOvernight = shiftTripToDate(overnight, "2026-05-15");
  const os = new Date(shiftedOvernight.start_time);
  const oe = new Date(shiftedOvernight.end_time);
  assert.equal(os.getDate(), 15);
  assert.equal(os.getHours(), 23);
  assert.equal(oe.getDate(), 16);
  assert.equal(oe.getHours(), 0);
  assert.equal(oe.getMinutes(), 30);

  assert.throws(() =>
    shiftTripToDate(
      {
        start_time: localIso(2026, 5, 11, 10, 0),
        end_time: localIso(2026, 5, 11, 10, 0),
      },
      "2026-05-12",
    ),
  );
});

test("buildPastePayload handles description trimming and vehicle_id validation", () => {
  const source = makeTrip({
    origin: "București",
    destination: "Ploiești",
    distance_km: 62.5,
    round_trip: true,
    description: "  Site visit  ",
    vehicle_id: 42,
  });

  const withValidVehicle = buildPastePayload(source, "2026-05-13", new Set([42]));
  assert.equal(withValidVehicle.origin, "București");
  assert.equal(withValidVehicle.destination, "Ploiești");
  assert.equal(withValidVehicle.distance_km, 62.5);
  assert.equal(withValidVehicle.round_trip, true);
  assert.equal(withValidVehicle.description, "Site visit");
  assert.equal(withValidVehicle.vehicle_id, 42);

  const withDeletedVehicle = buildPastePayload(source, "2026-05-13", new Set([1, 2]));
  assert.equal("vehicle_id" in withDeletedVehicle, false);

  const withoutValidSet = buildPastePayload(
    makeTrip({ description: "   ", vehicle_id: 99 }),
    "2026-05-13",
    null,
  );
  assert.equal("description" in withoutValidSet, false);
  assert.equal(withoutValidSet.vehicle_id, 99);
});

test("hasMatchingTripOnDay and getWorkdayPasteTargets skip weekends and existing matches", () => {
  const source = makeTrip({
    id: 1,
    origin: "Hotel",
    destination: "Client",
    start_time: localIso(2026, 5, 11, 8, 0),
    end_time: localIso(2026, 5, 11, 8, 30),
    round_trip: false,
  });
  const tuesdayDifferentTime = makeTrip({
    id: 2,
    origin: "Hotel",
    destination: "Client",
    start_time: localIso(2026, 5, 12, 17, 0),
    end_time: localIso(2026, 5, 12, 17, 30),
    round_trip: false,
  });
  const wednesdaySameTripDifferentCase = makeTrip({
    id: 3,
    origin: " hotel ",
    destination: "CLIENT",
    start_time: localIso(2026, 5, 13, 8, 0),
    end_time: localIso(2026, 5, 13, 8, 30),
    round_trip: false,
  });
  const thursdayRoundTripDiff = makeTrip({
    id: 4,
    origin: "Hotel",
    destination: "Client",
    start_time: localIso(2026, 5, 14, 8, 0),
    end_time: localIso(2026, 5, 14, 8, 30),
    round_trip: true,
  });

  assert.equal(hasMatchingTripOnDay([wednesdaySameTripDifferentCase], source), true);
  assert.equal(hasMatchingTripOnDay([tuesdayDifferentTime], source), false);
  assert.equal(hasMatchingTripOnDay([thursdayRoundTripDiff], source), false);

  const [week] = buildMileageWeeks({
    records: [
      source,
      tuesdayDifferentTime,
      wednesdaySameTripDifferentCase,
      thursdayRoundTripDiff,
    ],
    dateFrom: "2026-05-11",
    dateTo: "2026-05-17",
    includeEmptyDays: true,
  });

  // Mon (exact match) and Wed (case-insensitive match) are skipped; Sat & Sun skipped;
  // Tue (different HH:mm), Thu (different round_trip), Fri (empty) are returned.
  assert.deepEqual(getWorkdayPasteTargets(week, source), [
    "2026-05-12",
    "2026-05-14",
    "2026-05-15",
  ]);
});

test("formatting helpers and buildDefaultDateTimeLocal produce expected outputs", () => {
  assert.equal(formatDuration(0), "0h 00m");
  assert.equal(formatDuration(25), "0h 25m");
  assert.equal(formatDuration(59.8), "1h 00m");

  const sameDay = formatTripTimeRange(
    localIso(2026, 5, 11, 8, 5),
    localIso(2026, 5, 11, 9, 30),
    "ro-RO",
  );
  assert.deepEqual(sameDay, { startLabel: "08:05", endLabel: "09:30", dayOffset: 0 });

  const nextDay = formatTripTimeRange(
    localIso(2026, 5, 11, 23, 0),
    localIso(2026, 5, 12, 0, 30),
    "en-IE",
  );
  assert.deepEqual(nextDay, { startLabel: "23:00", endLabel: "00:30", dayOffset: 1 });

  assert.equal(formatWeekRange("2026-05-11", "2026-05-17", "en-IE"), "11 – 17 May 2026");
  assert.equal(formatWeekRange("2026-04-27", "2026-05-03", "en-IE"), "27 Apr – 3 May 2026");
  assert.equal(
    formatWeekRange("2026-12-28", "2027-01-03", "en-IE"),
    "28 Dec 2026 – 3 Jan 2027",
  );

  const heading = formatDayHeading("2026-05-11", "ro-RO");
  assert.equal(heading.weekday, "Luni");
  assert.equal(heading.shortDate, "11.05");

  assert.deepEqual(buildDefaultDateTimeLocal("2026-05-14"), {
    startTime: "2026-05-14T08:00",
    endTime: "2026-05-14T08:30",
  });
  assert.deepEqual(
    buildDefaultDateTimeLocal("2026-05-14", "2026-05-11T09:15", "2026-05-11T10:00"),
    {
      startTime: "2026-05-14T09:15",
      endTime: "2026-05-14T10:00",
    },
  );
  assert.deepEqual(
    buildDefaultDateTimeLocal("2026-05-14", "2026-05-11T11:00", "2026-05-11T10:00"),
    {
      startTime: "2026-05-14T08:00",
      endTime: "2026-05-14T08:30",
    },
  );
});

test("parseStrictDecimal and formatDistanceKm handle locale decimals, bounds, and hundredths", () => {
  assert.equal(parseStrictDecimal("12.25"), 12.25);
  assert.equal(parseStrictDecimal("12,25"), 12.25);
  assert.equal(parseStrictDecimal(" 0,01 "), 0.01);
  assert.equal(parseStrictDecimal("100000"), 100000);
  assert.equal(parseStrictDecimal("0"), null);
  assert.equal(parseStrictDecimal("0.009"), null);
  assert.equal(parseStrictDecimal("100000.01"), null);
  assert.equal(parseStrictDecimal("-5"), null);
  assert.equal(parseStrictDecimal("12abc"), null);
  assert.equal(parseStrictDecimal("12.3.4"), null);
  assert.equal(parseStrictDecimal(""), null);

  assert.equal(formatDistanceKm(12), "12.0");
  assert.equal(formatDistanceKm(12.5), "12.5");
  assert.equal(formatDistanceKm(12.25), "12.25");
  assert.equal(formatDistanceKm(0.01), "0.01");
  assert.equal(formatDistanceKm(0.1), "0.1");
});

test("isoToDateTimeLocal, shiftEndTimeForStartChange, and computeTripDurationPreview handle duration shifts and overnight trips", () => {
  const iso = localIso(2026, 5, 11, 8, 5);
  assert.equal(isoToDateTimeLocal(iso), "2026-05-11T08:05");

  // Forward day shift preserves 1h 30m duration
  assert.equal(
    shiftEndTimeForStartChange("2026-05-11T08:00", "2026-05-11T09:30", "2026-05-12T10:15"),
    "2026-05-12T11:45",
  );
  // Backward day shift preserves 1h 30m duration
  assert.equal(
    shiftEndTimeForStartChange("2026-05-13T08:00", "2026-05-13T09:30", "2026-05-12T08:00"),
    "2026-05-12T09:30",
  );
  // Invalid or non-positive range returns prevEndLocal unchanged
  assert.equal(
    shiftEndTimeForStartChange("2026-05-11T10:00", "2026-05-11T09:00", "2026-05-12T08:00"),
    "2026-05-11T09:00",
  );
  assert.equal(
    shiftEndTimeForStartChange("invalid", "2026-05-11T09:00", "2026-05-12T08:00"),
    "2026-05-11T09:00",
  );

  assert.deepEqual(computeTripDurationPreview("2026-05-11T08:00", "2026-05-11T09:30"), {
    durationMinutes: 90,
    formatted: "1h 30m",
    dayOffset: 0,
  });
  assert.deepEqual(computeTripDurationPreview("2026-05-11T23:00", "2026-05-12T00:30"), {
    durationMinutes: 90,
    formatted: "1h 30m",
    dayOffset: 1,
  });
  assert.equal(computeTripDurationPreview("2026-05-11T09:30", "2026-05-11T09:30"), null);
});

test("detectVehicleSnapshotDrift handles matched, drifted, deleted, none, null consumption, and pre-V109 null category", () => {
  const activeVehicles = [
    {
      id: 7,
      plate_number: "B-12-ABC",
      make_model: "Dacia Duster",
      fuel_type: "diesel",
      vehicle_category: "M1",
      fuel_consumption_l_per_100km: 6.5,
    },
    {
      id: 8,
      plate_number: "B-34-DEF",
      make_model: "VW Golf",
      fuel_type: "petrol",
      vehicle_category: "M1",
      fuel_consumption_l_per_100km: null,
    },
  ];

  // Exact match
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: 7,
        vehicle_plate: " b-12-abc ",
        vehicle_make_model: "Dacia Duster",
        vehicle_fuel_type: "diesel",
        vehicle_category: "m1",
        fuel_consumption_l_per_100km: 6.5,
      },
      activeVehicles,
    ),
    "matched",
  );

  // Active vehicle with null consumption does NOT false-positive when trip stored default 7.5
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: 8,
        vehicle_plate: "B-34-DEF",
        vehicle_make_model: "VW Golf",
        vehicle_fuel_type: "petrol",
        vehicle_category: null, // pre-V109 null category also does not false-positive
        fuel_consumption_l_per_100km: 7.5,
      },
      activeVehicles,
    ),
    "matched",
  );

  // Drifted consumption
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: 7,
        vehicle_plate: "B-12-ABC",
        vehicle_make_model: "Dacia Duster",
        vehicle_fuel_type: "diesel",
        vehicle_category: "M1",
        fuel_consumption_l_per_100km: 7.2,
      },
      activeVehicles,
    ),
    "drifted",
  );

  // Deleted vehicle with snapshot preserved
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: null,
        vehicle_plate: "B-99-OLD",
        vehicle_make_model: "Old Car",
        vehicle_fuel_type: "diesel",
        vehicle_category: "M1",
        fuel_consumption_l_per_100km: 6.0,
      },
      activeVehicles,
    ),
    "deleted",
  );

  // Missing active vehicle ID
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: 999,
        vehicle_plate: "B-99-OLD",
        vehicle_make_model: null,
        vehicle_fuel_type: null,
        vehicle_category: null,
        fuel_consumption_l_per_100km: null,
      },
      activeVehicles,
    ),
    "deleted",
  );

  // No vehicle and no snapshot
  assert.equal(
    detectVehicleSnapshotDrift(
      {
        vehicle_id: null,
        vehicle_plate: null,
        vehicle_make_model: null,
        vehicle_fuel_type: null,
        vehicle_category: null,
        fuel_consumption_l_per_100km: 7.5,
      },
      activeVehicles,
    ),
    "none",
  );
});

test("buildMileagePatchPayload produces sparse diffs, clears description with empty string, and returns null on no-op", () => {
  const startWithSeconds = new Date(2026, 4, 11, 8, 15, 42, 0).toISOString();
  const endWithSeconds = new Date(2026, 4, 11, 9, 45, 19, 0).toISOString();
  const original = {
    origin: "Hotel",
    destination: "Factory",
    start_time: startWithSeconds,
    end_time: endWithSeconds,
    distance_km: 24.5,
    description: "Daily commute",
    round_trip: false,
    version: 3,
  };

  const unchangedDraft = {
    origin: " Hotel ",
    destination: "Factory",
    startTime: "2026-05-11T08:15",
    endTime: "2026-05-11T09:45",
    distanceKm: "24,50",
    description: "Daily commute",
    roundTrip: false,
  };
  const initialChoice = { kind: "vehicle", vehicleId: 7 };

  // No-op returns null even when original timestamps had non-zero seconds
  assert.equal(
    buildMileagePatchPayload(original, unchangedDraft, initialChoice, initialChoice),
    null,
  );

  // Distance + description clear + version attached
  const patch1 = buildMileagePatchPayload(
    original,
    { ...unchangedDraft, distanceKm: "12,25", description: "   " },
    initialChoice,
    initialChoice,
  );
  assert.deepEqual(patch1, {
    distance_km: 12.25,
    description: "",
    version: 3,
  });

  // Vehicle clear
  const patch2 = buildMileagePatchPayload(
    original,
    unchangedDraft,
    { kind: "none" },
    { kind: "keep_snapshot" },
  );
  assert.deepEqual(patch2, {
    clear_vehicle: true,
    version: 3,
  });

  // Vehicle switch without version on original omits version
  const patch3 = buildMileagePatchPayload(
    { ...original, version: undefined },
    unchangedDraft,
    { kind: "vehicle", vehicleId: 9 },
    { kind: "keep_snapshot" },
  );
  assert.deepEqual(patch3, {
    vehicle_id: 9,
  });
});
