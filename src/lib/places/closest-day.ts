/**
 * Closest-day picker for the F1 "add place" feature (Phase 6 EDIT-01).
 *
 * PURE — no HTTP, no DB, no process.env.
 * All inputs come in as arguments; all outputs are return values.
 * This module is independently unit-testable with in-memory data.
 *
 * Closest-day metric (06-CONTEXT.md §Closest-day metric):
 *   For a new place p, day distance = min over that day's places of haversine(p, place).
 *   Chosen day = the day with the smallest such distance.
 *   Days with zero visits are skipped.
 *   Tie-breaking: first-encountered day wins (stable, strict less-than comparison).
 */

/**
 * A day's worth of places with lat/lng coordinates.
 *
 * Used as input to pickClosestDay so the caller can pass either
 * ResolvedPlace coords or ScheduledVisit coords without coupling this module
 * to either type.
 */
export interface DayWithCoords {
  dayNumber: number;
  visits: Array<{ lat: number; lng: number }>;
}

/**
 * Compute the great-circle distance in km using the Haversine formula.
 * R = 6371 km (mean Earth radius).
 *
 * @private — not exported; only used by pickClosestDay.
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Pick the day number (1-based) whose visits are closest to the new place.
 *
 * Distance metric per day: minimum haversine(newPlace, visit) over all visits in that day.
 * Days with zero visits are skipped (they contribute no distance signal).
 * Tie-breaking: the first-encountered day wins (stable — strict less-than comparison).
 *
 * @param newPlace  Coordinates of the place to add.
 * @param days      Existing days with their visit coordinates.
 * @returns         The dayNumber of the closest day.
 */
export function pickClosestDay(
  newPlace: { lat: number; lng: number },
  days: DayWithCoords[]
): number {
  let bestDay = days[0].dayNumber;
  let bestDist = Infinity;

  for (const day of days) {
    if (day.visits.length === 0) continue;

    const minDist = Math.min(
      ...day.visits.map((v) => haversine(newPlace.lat, newPlace.lng, v.lat, v.lng))
    );

    // Strict less-than: first day wins on equal distance (stable tie-breaking)
    if (minDist < bestDist) {
      bestDist = minDist;
      bestDay = day.dayNumber;
    }
  }

  return bestDay;
}
