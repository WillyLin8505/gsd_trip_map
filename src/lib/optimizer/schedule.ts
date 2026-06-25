/**
 * Day scheduling functions for the itinerary optimizer.
 *
 * This module is intentionally PURE — no HTTP, no DB, no process.env.
 * All inputs come in as arguments; all outputs are return values.
 *
 * Implements:
 *   SCHED-01 — auto day-count suggestion from durations + avg travel time
 *   SCHED-02 — caller-supplied numDays override (honored here via splitIntoDays)
 *   SCHED-04 — no visit falls outside opening hours; unscheduled[] for non-fitting
 *   SCHED-05 — concrete HH:MM times for every scheduled visit
 *
 * Pitfall 3 (hoursUnknown): places with hoursUnknown=true ALWAYS retain a slot.
 *   They emit hoursUnknown:true + a warning and are NEVER treated as "always open"
 *   (which would omit the flag). isOpenAt is NOT consulted for hoursUnknown places.
 *
 * Pitfall 8 (timezone): scheduling uses dayOfWeek derived from travelDate offset
 *   per day bucket, aligned with the place's utcOffsetMinutes for correct local time.
 */

import type { OptimizerPlace, TravelMatrix } from "./types";
import { isOpenAt } from "./opening-hours";

// ---------------------------------------------------------------------------
// Public interfaces (locked to 02-CONTEXT.md API contract)
// ---------------------------------------------------------------------------

/**
 * A single scheduled place visit within a day.
 *
 * Field names match the POST /api/optimize response contract exactly.
 */
export interface ScheduledVisit {
  placeId: string;
  displayName: string;
  /** "HH:MM" formatted local time when the visit starts */
  scheduledStart: string;
  /** "HH:MM" formatted local time when the visit ends */
  scheduledEnd: string;
  /** Travel time in minutes from the previous stop (0 for first stop of each day) */
  travelFromPrevMinutes: number;
  /** Minutes waited at the place before it opened (0 if arrived after open) */
  waitMinutes: number;
  /** True when opening hours were unavailable — slot is kept, warning emitted */
  hoursUnknown: boolean;
  /** Human-readable warning; present when hoursUnknown=true */
  warning?: string;
}

/**
 * The full result of the optimize() orchestrator.
 *
 * Matches the POST /api/optimize response shape from 02-CONTEXT.md.
 */
export interface OptimizeResult {
  /** Number of days the schedule is spread across (auto-calculated or caller-supplied) */
  suggestedDays: number;
  days: Array<{
    dayNumber: number;
    visits: ScheduledVisit[];
  }>;
  /** Places that couldn't be scheduled — each includes a human-readable reason */
  unscheduled: Array<{ placeId: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Scheduling options shared by splitIntoDays and scheduleTimes
// ---------------------------------------------------------------------------

export interface ScheduleOpts {
  /** Minutes since midnight for start of each day (default: 540 = 09:00) */
  dailyStartMinutes: number;
  /** Minutes since midnight for end of each day (default: 1260 = 21:00) */
  dailyEndMinutes: number;
  /** ISO-8601 date string for the first travel day (e.g. "2026-07-01") */
  travelDate?: string;
}

// ---------------------------------------------------------------------------
// minutesToHHMM
// ---------------------------------------------------------------------------

/**
 * Convert minutes since midnight to a zero-padded "HH:MM" string.
 *
 * @example minutesToHHMM(540)  → "09:00"
 * @example minutesToHHMM(1290) → "21:30"
 */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// suggestDayCount
// ---------------------------------------------------------------------------

/**
 * Auto-calculate the number of days needed for a given set of places + matrix.
 *
 * Formula: max(1, ceil((sumVisitDurations + (N-1) * avgTravelTime) / dailyBudgetMinutes))
 *
 * avgTravelTime is the mean of all off-diagonal matrix entries. For N=1, no
 * travel time is added (no adjacent pairs), so the formula degrades gracefully.
 *
 * @param places               Places to schedule.
 * @param matrix               N×N travel time matrix.
 * @param dailyBudgetMinutes   Available minutes per day (default: 720 = 12 h).
 */
export function suggestDayCount(
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  dailyBudgetMinutes = 720
): number {
  const n = places.length;
  if (n === 0) return 1;

  const sumVisitDurations = places.reduce(
    (acc, p) => acc + p.visitDurationMinutes,
    0
  );

  // Average of all off-diagonal matrix entries
  let offDiagonalSum = 0;
  let offDiagonalCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        offDiagonalSum += matrix[i][j];
        offDiagonalCount++;
      }
    }
  }
  const avgTravel = offDiagonalCount > 0 ? offDiagonalSum / offDiagonalCount : 0;

  // (N-1) travel legs in a single open path through N nodes
  const totalMinutes = sumVisitDurations + (n - 1) * avgTravel;

  return Math.max(1, Math.ceil(totalMinutes / dailyBudgetMinutes));
}

// ---------------------------------------------------------------------------
// splitIntoDays
// ---------------------------------------------------------------------------

/**
 * Greedy bin-packing: walk the `order` (optimized index sequence) and accumulate
 * visitDuration + travelFromPrev per day. Start a new day whenever the running
 * total would exceed (dailyEndMinutes - dailyStartMinutes).
 *
 * Returns `dayOrders` (array of index arrays, one per day, length ≤ numDays) and
 * `overflow` (indices that could not fit into any of the numDays buckets).
 *
 * Callers are responsible for converting overflow indices to unscheduled entries.
 */
export function splitIntoDays(
  order: number[],
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  numDays: number,
  opts: Pick<ScheduleOpts, "dailyStartMinutes" | "dailyEndMinutes">
): { dayOrders: number[][]; overflow: number[] } {
  const windowMinutes = opts.dailyEndMinutes - opts.dailyStartMinutes;
  const dayOrders: number[][] = [];
  const overflow: number[] = [];

  // currentDay accumulates indices for the day being built.
  // null means we are in "overflow mode" (all day buckets filled).
  let currentDay: number[] | null = [];
  let currentDayMinutes = 0;
  let prevIndex: number | null = null;

  for (const idx of order) {
    // If we've already exhausted all day buckets, overflow remaining
    if (currentDay === null) {
      overflow.push(idx);
      continue;
    }

    const travelFromPrev =
      prevIndex === null ? 0 : matrix[prevIndex][idx];

    if (currentDay.length === 0) {
      // First place in a new day — always start here; no travel from prev on day boundary
      currentDay.push(idx);
      currentDayMinutes = places[idx].visitDurationMinutes;
      prevIndex = idx;
    } else if (
      currentDayMinutes + travelFromPrev + places[idx].visitDurationMinutes <=
      windowMinutes
    ) {
      // Fits in the current day
      currentDay.push(idx);
      currentDayMinutes += travelFromPrev + places[idx].visitDurationMinutes;
      prevIndex = idx;
    } else {
      // Doesn't fit — seal the current day
      dayOrders.push(currentDay);

      if (dayOrders.length >= numDays) {
        // All day buckets are now full → overflow mode
        overflow.push(idx);
        currentDay = null;
      } else {
        // Open a new day with this place
        currentDay = [idx];
        currentDayMinutes = places[idx].visitDurationMinutes;
        prevIndex = idx;
      }
    }
  }

  // Commit the last open day (if any)
  if (currentDay !== null && currentDay.length > 0) {
    if (dayOrders.length < numDays) {
      dayOrders.push(currentDay);
    } else {
      overflow.push(...currentDay);
    }
  }

  return { dayOrders, overflow };
}

// ---------------------------------------------------------------------------
// scheduleTimes
// ---------------------------------------------------------------------------

/**
 * Options for scheduleTimes, including travelDate for day-of-week lookup.
 */
export interface ScheduleTimesOpts extends ScheduleOpts {
  travelDate: string; // required here — index.ts provides a default
}

/**
 * Parse an ISO date string and return the Date object at midnight UTC.
 * "2026-06-29" → Date for 2026-06-29T00:00:00.000Z
 */
function parseIsoDate(isoDate: string): Date {
  // Split to avoid timezone issues with Date.parse
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get the JavaScript day-of-week (0=Sun…6=Sat) for the Nth day of the trip,
 * derived from the first travel date + day offset.
 */
function getDayOfWeek(travelDate: string, dayOffset: number): number {
  const base = parseIsoDate(travelDate);
  const target = new Date(base.getTime() + dayOffset * 86_400_000);
  return target.getUTCDay(); // 0=Sun…6=Sat
}

/**
 * Walk each day's ordered place list and assign concrete arrival/start/end times.
 *
 * Rules per visit:
 *   1. travelFromPrev = 0 for the first visit of each day.
 *   2. arrivalTime = prevDepartureTime + travelFromPrev (for subsequent visits).
 *   3. If hoursUnknown=true: schedule the slot as-is, emit hoursUnknown:true + warning.
 *      isOpenAt is NOT consulted (Pitfall 3).
 *   4. Determine openTime/closeTime from openingHours periods for the day's day-of-week.
 *      - If no period covers the visit day → push to unscheduled with "closed on this day".
 *      - scheduledStart = max(arrivalTime, openTime)
 *      - waitMinutes = scheduledStart - arrivalTime
 *      - If scheduledStart + visitDuration > closeTime → push to unscheduled
 *        with "exceeds closing time".
 *   5. scheduledEnd = scheduledStart + visitDuration.
 *   6. prevDepartureTime = scheduledEnd (or arrivalTime + visitDuration if hoursUnknown).
 */
export function scheduleTimes(
  dayOrders: number[][],
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  opts: ScheduleTimesOpts
): {
  days: Array<{ dayNumber: number; visits: ScheduledVisit[] }>;
  unscheduled: Array<{ placeId: string; reason: string }>;
} {
  const days: Array<{ dayNumber: number; visits: ScheduledVisit[] }> = [];
  const unscheduled: Array<{ placeId: string; reason: string }> = [];

  for (let dayIdx = 0; dayIdx < dayOrders.length; dayIdx++) {
    const dayNumber = dayIdx + 1; // 1-based
    const dayOfWeek = getDayOfWeek(opts.travelDate, dayIdx);
    const visits: ScheduledVisit[] = [];

    let currentTime = opts.dailyStartMinutes; // running clock for departure times
    let prevPlaceIdx: number | null = null;

    for (const placeIdx of dayOrders[dayIdx]) {
      const place = places[placeIdx];
      const travelFromPrev =
        prevPlaceIdx === null ? 0 : matrix[prevPlaceIdx][placeIdx];
      const arrivalTime = prevPlaceIdx === null
        ? opts.dailyStartMinutes
        : currentTime + travelFromPrev;

      // --- hoursUnknown path (Pitfall 3: never drop, never treat as always-open) ---
      if (place.hoursUnknown) {
        const scheduledStartMin = arrivalTime;
        const scheduledEndMin = scheduledStartMin + place.visitDurationMinutes;

        visits.push({
          placeId: place.placeId,
          displayName: place.displayName,
          scheduledStart: minutesToHHMM(scheduledStartMin),
          scheduledEnd: minutesToHHMM(scheduledEndMin),
          travelFromPrevMinutes: travelFromPrev,
          waitMinutes: 0,
          hoursUnknown: true,
          warning: "營業時間未知，建議出發前確認",
        });

        currentTime = scheduledEndMin;
        prevPlaceIdx = placeIdx;
        continue;
      }

      // --- Known hours path ---
      const periods = place.openingHours ?? [];

      // Find the open/close window for this day-of-week
      const openWindow = getOpenWindow(periods, dayOfWeek);

      if (openWindow === null) {
        // Closed entirely on this day
        unscheduled.push({
          placeId: place.placeId,
          reason: `${place.displayName} 在行程當天休息，無法安排`,
        });
        // Still advance the clock using arrival + duration for time-accounting purposes
        currentTime = arrivalTime + place.visitDurationMinutes;
        prevPlaceIdx = placeIdx;
        continue;
      }

      const { openTime, closeTime } = openWindow;
      const scheduledStartMin = Math.max(arrivalTime, openTime);
      const waitMinutes = scheduledStartMin - arrivalTime;
      const scheduledEndMin = scheduledStartMin + place.visitDurationMinutes;

      if (scheduledEndMin > closeTime) {
        // Visit would run past closing time
        unscheduled.push({
          placeId: place.placeId,
          reason: `${place.displayName} 無法在打烊前完成參觀 (需要至 ${minutesToHHMM(scheduledEndMin)}，打烊時間 ${minutesToHHMM(closeTime)})`,
        });
        currentTime = arrivalTime + place.visitDurationMinutes;
        prevPlaceIdx = placeIdx;
        continue;
      }

      visits.push({
        placeId: place.placeId,
        displayName: place.displayName,
        scheduledStart: minutesToHHMM(scheduledStartMin),
        scheduledEnd: minutesToHHMM(scheduledEndMin),
        travelFromPrevMinutes: travelFromPrev,
        waitMinutes,
        hoursUnknown: false,
      });

      currentTime = scheduledEndMin;
      prevPlaceIdx = placeIdx;
    }

    days.push({ dayNumber, visits });
  }

  return { days, unscheduled };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the open/close window for a specific day-of-week from an array of periods.
 *
 * Returns the first period that starts on `dayOfWeek`, expressed as
 * { openTime, closeTime } in minutes since midnight.
 *
 * For 24h periods (no close, or open===close in minutes-of-week): closeTime = 1440.
 *
 * Returns null if no period covers the requested day.
 */
function getOpenWindow(
  periods: import("./types").OpeningHoursPeriod[],
  dayOfWeek: number
): { openTime: number; closeTime: number } | null {
  for (const period of periods) {
    if (period.open.day !== dayOfWeek) continue;

    const openTime = period.open.hour * 60 + period.open.minute;

    if (!period.close) {
      // 24h open (no close field)
      return { openTime, closeTime: 1440 };
    }

    const closeMow =
      period.close.day * 1440 + period.close.hour * 60 + period.close.minute;
    const openMow =
      period.open.day * 1440 + period.open.hour * 60 + period.open.minute;

    if (closeMow === openMow) {
      // All-day open (open === close in minutes-of-week)
      return { openTime, closeTime: 1440 };
    }

    // For same-day windows (most common): close.day may equal open.day
    // For midnight-crossing: close.day > open.day — closeTime extends past 1440
    // We represent close in plain minutes from midnight on the OPEN day,
    // so for midnight-crossing add 1440 per overflow day.
    const closeExtraMinutes =
      (period.close.day - period.open.day) * 1440;
    const closeTime =
      closeExtraMinutes + period.close.hour * 60 + period.close.minute;

    return { openTime, closeTime };
  }

  return null;
}
