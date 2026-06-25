/**
 * optimize() — the top-level orchestrator for the itinerary optimizer.
 *
 * Pipeline:
 *   1. Apply defaults (dailyStartMinutes, dailyEndMinutes, travelDate, numDays)
 *   2. nearestNeighbor() — greedy route seed from Plan 01
 *   3. twoOptImprove()   — crossing removal from Plan 01
 *   4. splitIntoDays()   — greedy bin-packing into N day buckets (this plan)
 *   5. scheduleTimes()   — assign HH:MM times, respect opening hours (this plan)
 *   6. Merge splitIntoDays overflow into unscheduled[] with reason string
 *
 * Purity contract: NO HTTP, NO DB, NO process.env anywhere in this file.
 * All data comes in via OptimizerInput; all output is the OptimizeResult return value.
 *
 * Implements:
 *   SCHED-01 — auto day-count (suggestDayCount) when numDays is omitted
 *   SCHED-02 — caller-supplied numDays overrides the suggestion
 *   SCHED-03 — distance-ordered route via nearestNeighbor + twoOptImprove
 *   SCHED-04 — opening-hours constraints enforced in scheduleTimes
 *   SCHED-05 — concrete HH:MM times for every scheduled visit
 */

import type { OptimizerInput } from "./types";
import { nearestNeighbor, twoOptImprove } from "./route";
import {
  suggestDayCount,
  splitIntoDays,
  scheduleTimes,
} from "./schedule";

// Re-export public types for downstream consumers (Plan 03 Route Handler)
export type { OptimizeResult, ScheduledVisit } from "./schedule";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DAILY_START_MINUTES = 540;   // 09:00
const DEFAULT_DAILY_END_MINUTES   = 1260;  // 21:00

/**
 * Return the ISO date string for the next Monday on or after today (UTC).
 * Used when the caller omits travelDate.
 */
function nextMonday(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  // Days until next Monday: if today IS Monday (1), use 0; otherwise calc offset
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 7;
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      daysUntilMonday * 86_400_000
  );
  return target.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ---------------------------------------------------------------------------
// optimize()
// ---------------------------------------------------------------------------

/**
 * Run the full optimization pipeline and return the structured day-by-day
 * schedule that matches the POST /api/optimize response contract.
 *
 * @param input  Full optimizer input bundle (places, matrix, optional overrides).
 * @returns      OptimizeResult with suggestedDays, days[], and unscheduled[].
 */
export function optimize(
  input: OptimizerInput
): import("./schedule").OptimizeResult {
  const dailyStartMinutes = input.dailyStartMinutes ?? DEFAULT_DAILY_START_MINUTES;
  const dailyEndMinutes   = input.dailyEndMinutes   ?? DEFAULT_DAILY_END_MINUTES;
  const travelDate        = input.travelDate        ?? nextMonday();
  const dailyBudget       = dailyEndMinutes - dailyStartMinutes;

  // Step 1: Determine number of days (auto-suggest or caller override — SCHED-01/02)
  const suggested =
    input.numDays != null
      ? input.numDays
      : suggestDayCount(input.places, input.matrix, dailyBudget);

  // Step 2: Build initial route with nearest-neighbor heuristic (SCHED-03)
  const seed = nearestNeighbor(input.matrix, 0);

  // Step 3: Improve route with 2-opt local search (SCHED-03)
  const improved = twoOptImprove(seed, input.matrix, 4);

  const opts = { dailyStartMinutes, dailyEndMinutes };

  // Step 4: Greedy day-split (SCHED-02 numDays honored here)
  const { dayOrders, overflow } = splitIntoDays(
    improved,
    input.places,
    input.matrix,
    suggested,
    opts
  );

  // Step 5: Assign concrete HH:MM times, respect opening hours (SCHED-04/05)
  const { days, unscheduled } = scheduleTimes(dayOrders, input.places, input.matrix, {
    ...opts,
    travelDate,
  });

  // Step 6: Merge overflow (places that couldn't fit any day bucket) into unscheduled
  for (const idx of overflow) {
    const place = input.places[idx];
    unscheduled.push({
      placeId: place.placeId,
      reason: `${place.displayName} 無法放入任何行程日（行程天數不足）`,
    });
  }

  return {
    suggestedDays: suggested,
    days,
    unscheduled,
  };
}
