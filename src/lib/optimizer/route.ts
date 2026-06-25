/**
 * Route construction and improvement functions.
 *
 * These are PURE functions operating on integer indices and a TravelMatrix.
 * They have zero knowledge of places, opening hours, or any I/O — that
 * separation keeps them independently unit-testable with mock matrices.
 *
 * Implements SCHED-03 (distance ordering):
 *   nearestNeighbor() seeds a route by greedy travel-time distance.
 *   twoOptImprove() removes edge crossings, producing a locally optimal path.
 *
 * Opening-hours feasibility (SCHED-04) is layered on by the scheduler in
 * Plan 02, not here — this module never sees period or time data.
 *
 * T-02-01 (DoS): twoOptImprove is O(N²·passes). N is capped at ≤30 by the
 * Route Handler (Plan 03) before these functions are called.
 */

import type { TravelMatrix } from "./types";

// ---------------------------------------------------------------------------
// routeTravelTime
// ---------------------------------------------------------------------------

/**
 * Sum the travel times of consecutive legs in `order` using `matrix`.
 *
 * This is an OPEN path (no return-to-origin leg). For an order of length N,
 * the result is sum of matrix[order[k]][order[k+1]] for k in 0..N-2.
 *
 * Returns 0 for an order of length ≤ 1.
 */
export function routeTravelTime(order: number[], matrix: TravelMatrix): number {
  let total = 0;
  for (let k = 0; k < order.length - 1; k++) {
    total += matrix[order[k]][order[k + 1]];
  }
  return total;
}

// ---------------------------------------------------------------------------
// nearestNeighbor
// ---------------------------------------------------------------------------

/**
 * Build an initial route using the classic greedy nearest-neighbor heuristic.
 *
 * Starting from `startIndex`, repeatedly append the unvisited node j that
 * minimizes matrix[current][j] until all N nodes are placed.
 *
 * Time complexity: O(N²) — suitable for N ≤ 30 (CONTEXT.md constraint).
 *
 * Note: this function orders by travel-time only (SCHED-03). Opening-hours
 * feasibility is NOT checked here — that responsibility lives in the scheduler.
 *
 * @param matrix      N×N travel time matrix (minutes).
 * @param startIndex  Index of the first node in the route (default: 0).
 * @returns           A permutation of [0..N-1] starting at startIndex.
 */
export function nearestNeighbor(
  matrix: TravelMatrix,
  startIndex = 0
): number[] {
  const n = matrix.length;
  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [];

  let current = startIndex;
  visited[current] = true;
  order.push(current);

  for (let step = 1; step < n; step++) {
    let bestNext = -1;
    let bestDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[current][j] < bestDist) {
        bestDist = matrix[current][j];
        bestNext = j;
      }
    }

    if (bestNext === -1) break; // defensive: all visited (shouldn't happen)
    visited[bestNext] = true;
    order.push(bestNext);
    current = bestNext;
  }

  return order;
}

// ---------------------------------------------------------------------------
// twoOptImprove
// ---------------------------------------------------------------------------

/**
 * Apply 2-opt local search to improve a route.
 *
 * For each pair of edges (i, k) with i < k, reverse the segment order[i..k]
 * and accept the reversal if it strictly lowers routeTravelTime. Repeat for
 * `passes` iterations, stopping early if a full pass yields no improvement.
 *
 * Guarantee (monotone): the returned route's routeTravelTime is always ≤ the
 * input route's routeTravelTime.
 *
 * Time complexity: O(N² × passes) — for N ≤ 30 and passes ≤ 5 this is fast
 * (<5ms in practice). Default passes=4 per CONTEXT.md (guidance: 3-5).
 *
 * Note: opening-hours re-validation after swaps is the responsibility of the
 * scheduler in Plan 02, which wraps this function.
 *
 * @param order   Index permutation to improve (not mutated).
 * @param matrix  N×N travel time matrix.
 * @param passes  Maximum number of improvement passes (default: 4).
 * @returns       An improved (or equal) index permutation.
 */
export function twoOptImprove(
  order: number[],
  matrix: TravelMatrix,
  passes = 4
): number[] {
  // Work on a copy so the input is not mutated
  let best = [...order];
  let bestCost = routeTravelTime(best, matrix);

  for (let pass = 0; pass < passes; pass++) {
    let improved = false;

    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        // Reverse segment [i..k]
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candidateCost = routeTravelTime(candidate, matrix);

        if (candidateCost < bestCost) {
          best = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }

    // Early exit: no improvement in this pass
    if (!improved) break;
  }

  return best;
}
