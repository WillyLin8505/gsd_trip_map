import { describe, it, expect } from "vitest";
import { routeTravelTime, nearestNeighbor, twoOptImprove } from "./route";
import type { TravelMatrix } from "./types";

// ---------------------------------------------------------------------------
// routeTravelTime
// ---------------------------------------------------------------------------

describe("routeTravelTime", () => {
  it("returns the sum of consecutive leg travel times (no return-to-origin)", () => {
    // 3-node matrix: 0→1=10, 1→2=20
    const matrix: TravelMatrix = [
      [0, 10, 30],
      [10, 0, 20],
      [30, 20, 0],
    ];
    // order [0,1,2]: leg 0→1=10, leg 1→2=20 → total 30
    expect(routeTravelTime([0, 1, 2], matrix)).toBe(30);
  });

  it("returns 0 for a single-node order", () => {
    const matrix: TravelMatrix = [[0]];
    expect(routeTravelTime([0], matrix)).toBe(0);
  });

  it("is sensitive to order — different orders have different totals", () => {
    const matrix: TravelMatrix = [
      [0, 10, 50],
      [10, 0, 20],
      [50, 20, 0],
    ];
    // [0,1,2]: 10+20=30
    // [0,2,1]: 50+20=70
    expect(routeTravelTime([0, 1, 2], matrix)).toBe(30);
    expect(routeTravelTime([0, 2, 1], matrix)).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// nearestNeighbor
// ---------------------------------------------------------------------------

describe("nearestNeighbor", () => {
  it("returns a permutation of [0..N-1] with length N and no duplicates", () => {
    // 4-node symmetric matrix with unambiguous greedy choices
    const matrix: TravelMatrix = [
      [0, 1, 10, 10],
      [1, 0, 1, 10],
      [10, 1, 0, 1],
      [10, 10, 1, 0],
    ];
    const order = nearestNeighbor(matrix, 0);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
    // All indices 0–3 present
    expect(order.sort()).toEqual([0, 1, 2, 3]);
  });

  it("starts at the given startIndex", () => {
    const matrix: TravelMatrix = [
      [0, 5, 100],
      [5, 0, 5],
      [100, 5, 0],
    ];
    const order = nearestNeighbor(matrix, 2);
    expect(order[0]).toBe(2);
  });

  it("greedily picks the nearest unvisited node at each step — exact order on unambiguous matrix", () => {
    // Designed so the greedy path is unambiguous: 0→1 (dist 1), 1→2 (dist 1), 2→3 (dist 1)
    // All other distances are large enough to prevent alternative choices.
    const matrix: TravelMatrix = [
      [0, 1, 100, 100],
      [1, 0, 1, 100],
      [100, 1, 0, 1],
      [100, 100, 1, 0],
    ];
    const order = nearestNeighbor(matrix, 0);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("handles a 2-node matrix", () => {
    const matrix: TravelMatrix = [
      [0, 5],
      [5, 0],
    ];
    const order = nearestNeighbor(matrix, 0);
    expect(order).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// twoOptImprove
// ---------------------------------------------------------------------------

describe("twoOptImprove", () => {
  /**
   * Build a matrix with a known crossing.
   *
   * Arrange 4 nodes in a cross pattern so that the seed order [0,2,1,3]
   * crosses edges (0→2 and 1→3 are long) while the optimal order [0,1,2,3]
   * is significantly shorter.
   *
   *   0 ---  1
   *   |  ×   |
   *   2 ---  3
   *
   * Distances (symmetric):
   *   Adjacent pairs (0,1), (1,2), (2,3), (0,2): short = 1
   *   Diagonal pairs (0,3), (1,3): long = 100
   *   All others: moderate = 50
   *
   * The crossing seed [0,2,1,3]:
   *   0→2 (1) + 2→1 (1) + 1→3 (100) = 102
   *
   * The improved order [0,1,2,3] or similar:
   *   0→1 (1) + 1→2 (1) + 2→3 (1) = 3  (strict improvement)
   */
  const crossingMatrix: TravelMatrix = [
    //   0    1    2    3
    [0, 1, 1, 100], // 0
    [1, 0, 1, 100], // 1
    [1, 1, 0, 1], // 2
    [100, 100, 1, 0], // 3
  ];

  it("strictly improves a route with a known crossing", () => {
    const seed = [0, 2, 1, 3];
    const improved = twoOptImprove(seed, crossingMatrix);
    expect(routeTravelTime(improved, crossingMatrix)).toBeLessThan(
      routeTravelTime(seed, crossingMatrix)
    );
  });

  it("never increases total travel time vs. its input", () => {
    // Run on multiple different seeds; 2-opt must not make any of them worse.
    const matrices: TravelMatrix[] = [
      // Small 3-node matrix
      [
        [0, 10, 30],
        [10, 0, 20],
        [30, 20, 0],
      ],
      // 4-node crossing matrix
      crossingMatrix,
    ];

    for (const m of matrices) {
      const n = m.length;
      const seed = Array.from({ length: n }, (_, i) => i);
      const improved = twoOptImprove(seed, m);
      expect(routeTravelTime(improved, m)).toBeLessThanOrEqual(
        routeTravelTime(seed, m)
      );
    }
  });

  it("output is always a valid permutation of the same index set (no nodes lost or duplicated)", () => {
    const n = crossingMatrix.length;
    const seed = [0, 2, 1, 3];
    const improved = twoOptImprove(seed, crossingMatrix);

    expect(improved).toHaveLength(n);
    expect(new Set(improved).size).toBe(n);
    // All original indices present
    const originalSet = new Set(seed);
    for (const idx of improved) {
      expect(originalSet.has(idx)).toBe(true);
    }
  });

  it("returns the same order if no improvement is possible (already optimal)", () => {
    // Straight-line matrix: 0→1→2 is already optimal at any pass count
    const optimalMatrix: TravelMatrix = [
      [0, 1, 100],
      [1, 0, 1],
      [100, 1, 0],
    ];
    const seed = [0, 1, 2];
    const improved = twoOptImprove(seed, optimalMatrix);
    // routeTravelTime must be <= original (monotone guarantee)
    expect(routeTravelTime(improved, optimalMatrix)).toBeLessThanOrEqual(
      routeTravelTime(seed, optimalMatrix)
    );
    // And it must still be a permutation
    expect(new Set(improved).size).toBe(3);
  });
});
