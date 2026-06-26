/**
 * Single-day scheduling primitive for interactive day editing (Phase 6).
 *
 * PURE — no HTTP, no DB, no process.env.
 * All inputs come in as arguments; all outputs are return values.
 * This module is independently unit-testable with in-memory data.
 *
 * Implements:
 *   EDIT-01 — scheduleSingleDay reorder=false: keep given order, assign times
 *             (calls scheduleTimes for the time-walk; getOpenWindow is private
 *              in schedule.ts and is NOT imported — Pitfall 2)
 *   EDIT-02 — scheduleSingleDay reorder=true: classify → A-submatrix NN+2-opt
 *             → clock-walk meal insertion → scheduleTimes for time assignment
 *             (classifyPlace pure allowlist; null → attraction — T-06-06)
 */

import type { OptimizerPlace, TravelMatrix } from "./types";
import {
  scheduleTimes,
  type ScheduleTimesOpts,
  type ScheduledVisit,
} from "./schedule";
import { nearestNeighbor, twoOptImprove } from "./route";

// ---------------------------------------------------------------------------
// Place category constants (T-06-06: pure allowlist — null/unknown → attraction)
// ---------------------------------------------------------------------------

/** place_types that qualify a place as 餐廳 (eligible for lunch/dinner meal slots). */
const RESTAURANT_TYPES = new Set([
  "restaurant",
  "food",
  "meal_takeaway",
  "meal_delivery",
]);

/**
 * place_types that qualify a place as 點心.
 * 點心 are ordinary route stops (no meal slot) — ranked below 餐廳.
 */
const SNACK_TYPES = new Set([
  "cafe",
  "bakery",
  "dessert",
  "ice_cream_shop",
  "bar",
]);

/** Lunch window: slot START must fall in [690, 810) = [11:30, 13:30). */
const LUNCH_START = 690;
const LUNCH_END = 810;

/** Dinner window: slot START must fall in [1050, 1170) = [17:30, 19:30). */
const DINNER_START = 1050;
const DINNER_END = 1170;

// ---------------------------------------------------------------------------
// classifyPlace
// ---------------------------------------------------------------------------

/**
 * Classify a place's Google place_types into one of the three Phase 6 categories.
 *
 * Rules (CONTEXT.md — LOCKED):
 *  - null / empty → "attraction" (行程; no meal slot)
 *  - any RESTAURANT_TYPES match → "restaurant" (餐廳; wins ties with snack)
 *  - any SNACK_TYPES match → "snack" (點心; ordinary route stop)
 *  - else → "attraction" (行程; ordinary route stop)
 *
 * Security (T-06-06): pure allowlist lookup — null/unknown defaults to
 * "attraction" which has the least privileged behaviour.
 */
export function classifyPlace(
  placeTypes: string[] | null
): "restaurant" | "snack" | "attraction" {
  if (!placeTypes || placeTypes.length === 0) return "attraction";
  // restaurant wins ties — check RESTAURANT_TYPES first
  if (placeTypes.some((t) => RESTAURANT_TYPES.has(t))) return "restaurant";
  if (placeTypes.some((t) => SNACK_TYPES.has(t))) return "snack";
  return "attraction";
}

// ---------------------------------------------------------------------------
// scheduleSingleDay
// ---------------------------------------------------------------------------

/**
 * Schedule a single day of places and return the timed visit list.
 *
 * mode.reorder=false (F1 — EDIT-01):
 *   Keep the given `places[]` order; pass directly to scheduleTimes as a
 *   single-element dayOrders array; relabel the output dayNumber to mode.dayNumber.
 *   getOpenWindow is private in schedule.ts — reuse the time-walk by calling
 *   scheduleTimes([[...indices]], ...) directly (Pitfall 2).
 *
 * mode.reorder=true (F2 — EDIT-02):
 *   1. Classify each place via classifyPlace(p.placeTypes).
 *      R = 餐廳 indices; A = 點心 + 行程 indices (ordinary route stops).
 *   2. Build A-submatrix aMatrix[a][b] = matrix[A[a]][A[b]] and order A with
 *      nearestNeighbor + twoOptImprove on the sub-matrix (Pitfall 6 — map
 *      NN result indices back to full places[] indices via aOrder.map(i => A[i])).
 *   3. Clock-walk orderedAFull from opts.dailyStartMinutes using ONLY
 *      matrix travel times + visitDurationMinutes (NO opening-hours — Pitfall 8).
 *      On first arrival in the lunch window [690,810) with rPool non-empty,
 *      insert the nearest R to the current position. Same for dinner [1050,1170).
 *      Remaining rPool elements (>2 case) appended in original R order.
 *   4. Call scheduleTimes([finalOrder], ...) — opening-hours correctness
 *      (hoursUnknown, closed days) is entirely handled there.
 *
 * @param places  Ordered places to schedule for this day.
 * @param matrix  N×N travel time matrix aligned to places[].
 * @param opts    Schedule options; travelDate is REQUIRED (ScheduleTimesOpts).
 * @param mode    { reorder: boolean; dayNumber: number }
 * @returns       { day: { dayNumber, visits[] }, unscheduled[] }
 */
export function scheduleSingleDay(
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  opts: ScheduleTimesOpts,
  mode: { reorder: boolean; dayNumber: number }
): {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
} {
  if (!mode.reorder) {
    // reorder=false: keep given input order.
    // Build sequential index array [0, 1, ..., N-1] — preserves places[] order.
    const indices = places.map((_, i) => i);

    // Reuse the full time-walk from scheduleTimes for a single day.
    // getOpenWindow is private in schedule.ts — we cannot import it (Pitfall 2).
    // scheduleTimes hardcodes dayNumber = dayIdx + 1 = 1 for the first element.
    const { days, unscheduled } = scheduleTimes([indices], places, matrix, opts);

    // Relabel dayNumber to mode.dayNumber so the caller's day numbering is preserved.
    // Pitfall 9: days[0] may be undefined if places is empty; use optional-chaining
    // with fallback to empty visits array.
    return {
      day: { dayNumber: mode.dayNumber, visits: days[0]?.visits ?? [] },
      unscheduled,
    };
  }

  // ---------------------------------------------------------------------------
  // reorder=true (F2 auto-arrange)
  // ---------------------------------------------------------------------------

  // Step 1: Classify each place into R (restaurant) or A (snack + attraction).
  // null/missing placeTypes → "attraction" (Pitfall 4 / T-06-06 safe default).
  const categories = places.map((p, i) => ({
    i,
    cat: classifyPlace(p.placeTypes ?? null),
  }));
  const R = categories.filter((x) => x.cat === "restaurant").map((x) => x.i);
  const A = categories.filter((x) => x.cat !== "restaurant").map((x) => x.i);

  // Step 2: Order A with nearestNeighbor + 2-opt on the A-submatrix.
  // aMatrix[a][b] = matrix[A[a]][A[b]] — indices 0..A.length-1 (Pitfall 6).
  let orderedAFull: number[];
  if (A.length === 0) {
    orderedAFull = [];
  } else if (A.length === 1) {
    // Trivial: single element, no ordering needed.
    orderedAFull = [...A];
  } else {
    const aMatrix = A.map((ai) => A.map((aj) => matrix[ai][aj]));
    const seed = nearestNeighbor(aMatrix);
    const aOrder = twoOptImprove(seed, aMatrix);
    // CRITICAL (Pitfall 6): aOrder contains indices into aMatrix (0..A.length-1).
    // Map back to full places[] indices before passing to scheduleTimes.
    orderedAFull = aOrder.map((i) => A[i]);
  }

  // Step 3: Clock-walk orderedAFull; insert restaurants at meal windows.
  // This pre-simulation uses ONLY travel+visitDuration (Pitfall 8 — no opening-hours).
  // Opening-hours correctness is delegated to scheduleTimes in Step 4.
  const finalOrder: number[] = [];
  let currentTime = opts.dailyStartMinutes;
  let lunchPlaced = false;
  let dinnerPlaced = false;
  let rPool = [...R]; // restaurants not yet placed

  for (let k = 0; k < orderedAFull.length; k++) {
    const idx = orderedAFull[k];
    const travelFromPrev =
      k === 0 ? 0 : matrix[orderedAFull[k - 1]][idx];
    const arrivalTime = currentTime + travelFromPrev;

    if (
      !lunchPlaced &&
      arrivalTime >= LUNCH_START &&
      arrivalTime < LUNCH_END &&
      rPool.length > 0
    ) {
      // Lunch window reached — insert nearest restaurant from rPool.
      // "nearest" = smallest matrix[prevLocation][ri]; use last finalOrder element
      // as the current position (or idx if finalOrder is still empty).
      const prev =
        finalOrder.length > 0 ? finalOrder[finalOrder.length - 1] : idx;
      const bestR = rPool.reduce((best, ri) =>
        matrix[prev][ri] < matrix[prev][best] ? ri : best
      );
      finalOrder.push(bestR);
      rPool = rPool.filter((ri) => ri !== bestR);
      lunchPlaced = true;
      // Advance clock through the restaurant, then the current attraction.
      // (arrivalTime approximates when we enter this portion of the day)
      currentTime =
        arrivalTime +
        places[bestR].visitDurationMinutes +
        matrix[bestR][idx] +
        places[idx].visitDurationMinutes;
      finalOrder.push(idx);
    } else if (
      !dinnerPlaced &&
      arrivalTime >= DINNER_START &&
      arrivalTime < DINNER_END &&
      rPool.length > 0
    ) {
      // Dinner window reached — same pattern.
      const prev =
        finalOrder.length > 0 ? finalOrder[finalOrder.length - 1] : idx;
      const bestR = rPool.reduce((best, ri) =>
        matrix[prev][ri] < matrix[prev][best] ? ri : best
      );
      finalOrder.push(bestR);
      rPool = rPool.filter((ri) => ri !== bestR);
      dinnerPlaced = true;
      currentTime =
        arrivalTime +
        places[bestR].visitDurationMinutes +
        matrix[bestR][idx] +
        places[idx].visitDurationMinutes;
      finalOrder.push(idx);
    } else {
      // No meal window — place attraction/snack as a normal route stop.
      finalOrder.push(idx);
      currentTime = arrivalTime + places[idx].visitDurationMinutes;
    }
  }

  // Append any remaining restaurants in their original R order (>2 case).
  // These are placed in route order like attractions (no meal-slot guarantee).
  finalOrder.push(...rPool);

  // Step 4: Assign times via scheduleTimes.
  // scheduleTimes handles hoursUnknown, closed-day detection, and daily-end overflow.
  // Opening-hours correctness is entirely here — NOT in the clock walk above (Pitfall 8).
  const { days, unscheduled } = scheduleTimes([finalOrder], places, matrix, opts);

  // Relabel dayNumber; Pitfall 9: guard empty days[0].
  return {
    day: { dayNumber: mode.dayNumber, visits: days[0]?.visits ?? [] },
    unscheduled,
  };
}
