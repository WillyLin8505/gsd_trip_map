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
 *   EDIT-02 — scheduleSingleDay reorder=true: nearest-neighbor + meal-slotting
 *             (reorder=true branch is implemented in plan 06-02 — stub below)
 *
 * NOTE: classifyPlace is added in plan 06-02.
 */

import type { OptimizerPlace, TravelMatrix } from "./types";
import {
  scheduleTimes,
  type ScheduleTimesOpts,
  type ScheduledVisit,
} from "./schedule";

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
 *   Not yet implemented — throws a clear error. Implemented in plan 06-02.
 *   F1 never calls this branch; see 06-01-PLAN.md §Task 1.
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
  if (mode.reorder) {
    // reorder=true (F2 auto-arrange) is implemented in plan 06-02 (EDIT-02).
    // F1 only ever calls with reorder=false. This guard prevents accidental misuse.
    throw new Error(
      "scheduleSingleDay: reorder=true is not yet implemented. " +
        "This branch is reserved for plan 06-02 (EDIT-02 / F2 auto-arrange). " +
        "F1 always calls with reorder=false."
    );
  }

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
