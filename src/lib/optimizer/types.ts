/**
 * Optimizer type definitions.
 *
 * This module re-exports OpeningHoursPeriod from the Google Places client so
 * the optimizer and places client agree on the same shape — a single canonical
 * definition with no duplication.
 *
 * OptimizerPlace is the adapter interface that maps DB place rows into a form
 * the pure optimizer functions can consume without any DB or HTTP dependency.
 *
 * TravelMatrix[i][j] = travel minutes from place i to place j (diagonal = 0).
 * This is the N×N output of a Google Routes API computeRouteMatrix call.
 */

export type { OpeningHoursPeriod } from "@/lib/google/places-client";

/**
 * A single place as seen by the optimizer.
 *
 * All fields are derived from the `places` DB cache — the optimizer receives
 * this shape from the Route Handler (Plan 03) which fetches rows and maps them.
 * The optimizer NEVER touches the DB directly.
 */
export interface OptimizerPlace {
  /** Google place_id — used as a stable reference in the schedule output. */
  placeId: string;
  /** Display name for the schedule output (displayName from DB). */
  displayName: string;
  /** Latitude — used only if we fall back to Haversine distance estimation. */
  lat: number;
  /** Longitude — ditto. */
  lng: number;
  /**
   * regularOpeningHours.periods[] from DB (parsed from JSONB).
   * null when the places row has hours_unknown = true.
   */
  openingHours: import("@/lib/google/places-client").OpeningHoursPeriod[] | null;
  /**
   * Timezone offset in minutes east of UTC, as stored in places.utc_offset_minutes.
   * Required for timezone-correct scheduling (Pitfall 8 / T-02-02).
   * null when unavailable — isOpenAt should fall back to UTC+0.
   */
  utcOffsetMinutes: number | null;
  /** Visit duration in minutes derived from place_types heuristic (Plan 01 foundation). */
  visitDurationMinutes: number;
  /**
   * Mirrors places.hours_unknown.
   * true  → regularOpeningHours was absent from the API; NEVER treat as always-open.
   * false → openingHours holds a valid periods array.
   */
  hoursUnknown: boolean;
  /**
   * Google place_types from the DB cache (places.place_types column).
   * Used by classifyPlace (Phase 6 F2) to determine meal-slot eligibility:
   *   - 餐廳: intersects {restaurant, food, meal_takeaway, meal_delivery}
   *   - 點心: intersects {cafe, bakery, dessert, ice_cream_shop, bar}
   *   - 行程: everything else (also null/missing → 行程, no meal slot)
   * Optional — existing optimizer calls that don't do classification may omit it.
   */
  placeTypes?: string[] | null;
}

/**
 * Travel time matrix.
 *
 * matrix[i][j] = travel time in minutes from place index i to place index j.
 * Diagonal entries (matrix[i][i]) are always 0.
 * Populated via a single Google Routes API computeRouteMatrix call before the
 * optimizer is invoked; the optimizer must not fetch this data itself.
 */
export type TravelMatrix = number[][];

/**
 * Full input bundle passed to the optimizer service.
 *
 * Every piece of data the optimizer needs is passed here — no fetching inside.
 */
export interface OptimizerInput {
  /** Ordered list of places to schedule. Indices align with the matrix. */
  places: OptimizerPlace[];
  /**
   * N×N travel time matrix (minutes). matrix[i][j] aligns with places[i] → places[j].
   * Must satisfy: matrix.length === places.length and matrix[i].length === places.length.
   */
  matrix: TravelMatrix;
  /**
   * Number of days to spread the itinerary across.
   * If omitted, the optimizer auto-calculates (ceil of total time / daily budget).
   */
  numDays?: number;
  /**
   * ISO-8601 date string for the first day of travel (e.g. "2026-07-01").
   * Used to determine day-of-week for opening-hours checks.
   * If omitted, defaults to the next Monday from the current date.
   */
  travelDate?: string;
  /**
   * Minutes from midnight when each day starts (default: 540 = 09:00).
   * Places that open after this time will incur a wait on day-start.
   */
  dailyStartMinutes?: number;
  /**
   * Minutes from midnight when each day ends (default: 1260 = 21:00).
   * A visit whose scheduled end would exceed this value is pushed to the next day.
   */
  dailyEndMinutes?: number;
}
