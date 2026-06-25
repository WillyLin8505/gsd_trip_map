/**
 * Unit tests for the optimize() orchestrator in index.ts.
 *
 * Tests the full pipeline: nearestNeighbor → twoOptImprove → splitIntoDays
 * → scheduleTimes, with correct numDays handling (auto vs override).
 *
 * All tests use hand-built mock data — no API/DB calls.
 * This is the RED phase: tests are written before the optimize() implementation.
 */

import { describe, it, expect } from "vitest";
import { optimize } from "./index";
import type { OptimizerInput, OptimizerPlace, TravelMatrix } from "./types";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makePlace(
  id: string,
  overrides: Partial<OptimizerPlace> = {}
): OptimizerPlace {
  return {
    placeId: id,
    displayName: `Place ${id}`,
    lat: 25.0,
    lng: 121.5,
    openingHours: [
      // Mon-Sun 09:00-18:00
      { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
      { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
      { open: { day: 3, hour: 9, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } },
      { open: { day: 4, hour: 9, minute: 0 }, close: { day: 4, hour: 18, minute: 0 } },
      { open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 18, minute: 0 } },
      { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
    ],
    utcOffsetMinutes: 480,
    visitDurationMinutes: 60,
    hoursUnknown: false,
    ...overrides,
  };
}

function uniformMatrix(n: number, travel: number): TravelMatrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 0 : travel))
  );
}

function zeroMatrix(n: number): TravelMatrix {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

/** Monday 2026-06-29 */
const MONDAY = "2026-06-29";

// ---------------------------------------------------------------------------
// optimize() — numDays auto-suggestion (SCHED-01)
// ---------------------------------------------------------------------------

describe("optimize — numDays auto-suggestion (SCHED-01)", () => {
  it("when numDays omitted, suggestedDays matches suggestDayCount formula", () => {
    // 4 places × 60 min, zero travel → total=240, budget=720 → 1 day
    const places = Array.from({ length: 4 }, (_, i) => makePlace(`p${i}`));
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(4),
      travelDate: MONDAY,
    };
    const result = optimize(input);
    expect(result.suggestedDays).toBeGreaterThanOrEqual(1);
    // 240 min / 720 = 0.33 → ceil = 1
    expect(result.suggestedDays).toBe(1);
  });

  it("days.length equals suggestedDays when all places fit", () => {
    const places = Array.from({ length: 4 }, (_, i) => makePlace(`p${i}`));
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(4),
      travelDate: MONDAY,
    };
    const result = optimize(input);
    expect(result.days.length).toBe(result.suggestedDays);
  });
});

// ---------------------------------------------------------------------------
// optimize() — numDays override (SCHED-02)
// ---------------------------------------------------------------------------

describe("optimize — numDays override (SCHED-02)", () => {
  it("when numDays=2 supplied, days.length <= 2 and suggestedDays=2", () => {
    const places = Array.from({ length: 4 }, (_, i) => makePlace(`p${i}`));
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(4),
      numDays: 2,
      travelDate: MONDAY,
    };
    const result = optimize(input);
    expect(result.days.length).toBeLessThanOrEqual(2);
    expect(result.suggestedDays).toBe(2);
  });

  it("numDays=1 forces all places into 1 day or overflow", () => {
    // 3 places × 60 min, zero travel → total=180 < 720 → all fit in 1 day
    const places = Array.from({ length: 3 }, (_, i) => makePlace(`p${i}`));
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(3),
      numDays: 1,
      travelDate: MONDAY,
    };
    const result = optimize(input);
    expect(result.days.length).toBeLessThanOrEqual(1);
    expect(result.suggestedDays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// optimize() — conservation invariant (no place lost or duplicated)
// ---------------------------------------------------------------------------

describe("optimize — conservation invariant", () => {
  it("every place appears exactly once across days[].visits ∪ unscheduled", () => {
    const places = Array.from({ length: 5 }, (_, i) => makePlace(`p${i}`));
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(5),
      travelDate: MONDAY,
    };
    const result = optimize(input);

    const scheduledIds = result.days.flatMap((d) => d.visits.map((v) => v.placeId));
    const unscheduledIds = result.unscheduled.map((u) => u.placeId);
    const allIds = [...scheduledIds, ...unscheduledIds];

    expect(allIds.length).toBe(places.length);
    // No duplicates
    expect(new Set(allIds).size).toBe(places.length);
    // All original placeIds accounted for
    for (const p of places) {
      expect(allIds).toContain(p.placeId);
    }
  });

  it("conservation holds even with overflow places", () => {
    // Force overflow: 3 large places, numDays=1, window=720
    // 3 × 400 min → day1: p0(400), p1 overflows, p2 overflows
    const places = Array.from({ length: 3 }, (_, i) =>
      makePlace(`p${i}`, { visitDurationMinutes: 400 })
    );
    const input: OptimizerInput = {
      places,
      matrix: zeroMatrix(3),
      numDays: 1,
      travelDate: MONDAY,
    };
    const result = optimize(input);

    const scheduledIds = result.days.flatMap((d) => d.visits.map((v) => v.placeId));
    const unscheduledIds = result.unscheduled.map((u) => u.placeId);
    const allIds = [...scheduledIds, ...unscheduledIds];

    expect(allIds.length).toBe(3);
    expect(new Set(allIds).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// optimize() — pipeline order (nearestNeighbor → twoOptImprove → split → schedule)
// ---------------------------------------------------------------------------

describe("optimize — pipeline order", () => {
  it("2-opt improvement is applied (crossing fixture test)", () => {
    // Known crossing fixture from route.test.ts: [0,2,1,3] → 2-opt finds [0,1,2,3]
    // Build a matrix where the direct order 0→1→2→3 has lower total travel
    // than a crossing order 0→2→1→3
    //   0→1=10, 1→2=10, 2→3=10 (optimal path cost=30)
    //   0→2=50, 2→1=50, 1→3=50 (crossing path cost=150)
    const places = Array.from({ length: 4 }, (_, i) => makePlace(`p${i}`));
    const matrix: TravelMatrix = [
      //   0    1    2    3
      [  0,  10,  50,  50],  // from 0
      [ 10,   0,  10,  50],  // from 1
      [ 50,  10,   0,  10],  // from 2
      [ 50,  50,  10,   0],  // from 3
    ];
    const input: OptimizerInput = {
      places,
      matrix,
      travelDate: MONDAY,
      numDays: 1,
    };
    const result = optimize(input);

    // The scheduled visits should reflect the improved order
    // After 2-opt on this fixture, order should be [0,1,2,3] (cost 30) not [0,2,1,3] (cost 150)
    // All 4 should be scheduled since 4×60 + 3×10 = 270 < 720
    const visitIds = result.days.flatMap((d) => d.visits.map((v) => v.placeId));
    // The 2-opt-improved route should be [0,1,2,3] — verify sequential adjacency
    // Find positions in the output visits
    if (visitIds.length === 4) {
      const i0 = visitIds.indexOf("p0");
      const i1 = visitIds.indexOf("p1");
      const i2 = visitIds.indexOf("p2");
      const i3 = visitIds.indexOf("p3");
      // Optimal: p0 before p1, p1 before p2, p2 before p3
      // OR the reverse: p3 before p2, p2 before p1, p1 before p0
      const forwardOrder = i0 < i1 && i1 < i2 && i2 < i3;
      const reverseOrder = i3 < i2 && i2 < i1 && i1 < i0;
      expect(forwardOrder || reverseOrder).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// optimize() — output contract field presence
// ---------------------------------------------------------------------------

describe("optimize — output contract field presence", () => {
  it("result has suggestedDays, days, and unscheduled fields", () => {
    const places = [makePlace("p0")];
    const result = optimize({
      places,
      matrix: zeroMatrix(1),
      travelDate: MONDAY,
    });
    expect(result).toHaveProperty("suggestedDays");
    expect(result).toHaveProperty("days");
    expect(result).toHaveProperty("unscheduled");
  });

  it("each day has dayNumber and visits fields", () => {
    const places = [makePlace("p0")];
    const result = optimize({
      places,
      matrix: zeroMatrix(1),
      travelDate: MONDAY,
    });
    for (const day of result.days) {
      expect(day).toHaveProperty("dayNumber");
      expect(day).toHaveProperty("visits");
    }
  });

  it("each visit has all required contract fields", () => {
    const places = [makePlace("p0")];
    const result = optimize({
      places,
      matrix: zeroMatrix(1),
      travelDate: MONDAY,
    });
    const visits = result.days.flatMap((d) => d.visits);
    for (const v of visits) {
      expect(v).toHaveProperty("placeId");
      expect(v).toHaveProperty("displayName");
      expect(v).toHaveProperty("scheduledStart");
      expect(v).toHaveProperty("scheduledEnd");
      expect(v).toHaveProperty("travelFromPrevMinutes");
      expect(v).toHaveProperty("waitMinutes");
      expect(v).toHaveProperty("hoursUnknown");
      // scheduledStart/end are HH:MM
      expect(v.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
      expect(v.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("each unscheduled entry has placeId and reason fields", () => {
    // Force a place into unscheduled: visits Sunday-only but travelDate is Monday
    const places = [
      makePlace("p0"),
      makePlace("p1", {
        openingHours: [
          { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } }, // Sunday only
        ],
      }),
    ];
    const result = optimize({
      places,
      matrix: zeroMatrix(2),
      travelDate: MONDAY, // Monday → p1 (Sunday-only) should be unscheduled
    });
    for (const u of result.unscheduled) {
      expect(u).toHaveProperty("placeId");
      expect(u).toHaveProperty("reason");
    }
  });
});
