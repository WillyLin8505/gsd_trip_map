/**
 * Timezone-correct opening-hours feasibility predicate.
 *
 * This module is intentionally zero-dependency and pure — no HTTP, no DB, no
 * process.env. All inputs are passed as arguments; all outputs are return values.
 *
 * Implements T-02-02 mitigation: unit tests assert correct local-time
 * timezone conversion so that a wrong-timezone schedule cannot silently ship.
 *
 * Pitfall 8 (timezone): ALL opening-hours comparisons MUST be done in the
 * place's LOCAL time using utcOffsetMinutes from the places DB cache.
 *
 * Pitfall 3 (hoursUnknown): isOpenAt with an EMPTY periods array returns false.
 * The caller (scheduler, Plan 02) is responsible for deciding how to handle
 * places whose hours are unknown — isOpenAt never assumes "always open."
 */

import type { OpeningHoursPeriod } from "./types";

// ---------------------------------------------------------------------------
// toLocalMinutes
// ---------------------------------------------------------------------------

/**
 * Convert a UTC epoch timestamp to (dayOfWeek, localMinutes) in the place's
 * local timezone.
 *
 * - dayOfWeek follows Google's convention: 0 = Sunday … 6 = Saturday.
 * - localMinutes is minutes elapsed since local midnight (0–1439).
 * - utcOffsetMinutes=null is treated as UTC+0 (no-throw contract).
 * - Uses only arithmetic on epoch milliseconds — no timezone library required.
 *
 * @param utcEpochMs   UTC timestamp in milliseconds (e.g. Date.now())
 * @param utcOffsetMinutes  Offset in minutes east of UTC; null treated as 0
 */
export function toLocalMinutes(
  utcEpochMs: number,
  utcOffsetMinutes: number | null
): { dayOfWeek: number; localMinutes: number } {
  const offsetMs = (utcOffsetMinutes ?? 0) * 60_000;
  const localEpochMs = utcEpochMs + offsetMs;

  // Total minutes since the Unix epoch in local time
  const totalMinutes = Math.floor(localEpochMs / 60_000);

  // Minutes since local midnight for this specific day
  const localMinutes = ((totalMinutes % 1440) + 1440) % 1440;

  // Day of week: Unix epoch (Jan 1, 1970) was a Thursday (day 4 in JS Date).
  // Math.floor(localEpochMs / 86_400_000) gives days since epoch.
  const daysSinceEpoch = Math.floor(localEpochMs / 86_400_000);
  // (daysSinceEpoch + 4) % 7 gives 0=Sunday…6=Saturday (Thursday=4 offset)
  const dayOfWeek = ((daysSinceEpoch % 7) + 4 + 7) % 7;

  return { dayOfWeek, localMinutes };
}

// ---------------------------------------------------------------------------
// isOpenAt
// ---------------------------------------------------------------------------

/**
 * Determine whether a place is open at the given local day/time.
 *
 * @param periods          regularOpeningHours.periods[] from the places cache.
 *                         Empty array → always returns false (no known open window).
 * @param dayOfWeek        0 = Sunday … 6 = Saturday (Google convention).
 * @param localTimeMinutes Minutes since local midnight (0–1439).
 *
 * Handles three period shapes:
 *   (a) Normal same-day window: open.day == close.day and open < close in minutes-of-day.
 *   (b) Midnight-crossing window: close.day > open.day (or close < open in minute-of-week
 *       terms) — the window spans the day boundary.
 *   (c) 24h / all-day open: no close field, OR open === close (minutes-of-week identical).
 *       Returns true for the entire opening day (all 1440 minutes).
 *
 * All comparisons use "minutes-of-week" (0–10079) to handle midnight crossing uniformly.
 */
export function isOpenAt(
  periods: OpeningHoursPeriod[],
  dayOfWeek: number,
  localTimeMinutes: number
): boolean {
  if (periods.length === 0) return false;

  // Query expressed as minutes-of-week: day * 1440 + minutes-of-day
  const queryMow = dayOfWeek * 1440 + localTimeMinutes;

  for (const period of periods) {
    const openMow = period.open.day * 1440 + period.open.hour * 60 + period.open.minute;

    // Case (c): no close, or open === close → treat as open for the entire opening day.
    if (!period.close) {
      // Open for the full opening day: check if query is on that day
      if (period.open.day === dayOfWeek) return true;
      continue;
    }

    const closeMow =
      period.close.day * 1440 + period.close.hour * 60 + period.close.minute;

    // Case (c) continued: open === close minutes-of-week → all day open
    if (openMow === closeMow) {
      if (period.open.day === dayOfWeek) return true;
      continue;
    }

    if (closeMow > openMow) {
      // Case (a): normal same-day or same-week window (no midnight crossing)
      // Open: openMow <= queryMow < closeMow
      if (queryMow >= openMow && queryMow < closeMow) return true;
    } else {
      // Case (b): midnight-crossing window (closeMow < openMow in minute-of-week)
      // The window wraps around the week boundary.
      // A query is inside the window if: queryMow >= openMow OR queryMow < closeMow
      if (queryMow >= openMow || queryMow < closeMow) return true;
    }
  }

  return false;
}
