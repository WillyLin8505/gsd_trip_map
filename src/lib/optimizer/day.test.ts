import { describe, it, expect } from "vitest";
import { scheduleSingleDay } from "@/lib/optimizer/day";
import type { OptimizerPlace } from "@/lib/optimizer/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal OptimizerPlace for testing.
 * hoursUnknown=true by default to bypass opening-hours checks in most tests.
 */
function makePlace(overrides: Partial<OptimizerPlace> = {}): OptimizerPlace {
  return {
    placeId: "ChIJtest",
    displayName: "Test Place",
    lat: 25.0,
    lng: 121.5,
    openingHours: null,
    utcOffsetMinutes: 480,
    visitDurationMinutes: 60,
    hoursUnknown: true, // bypass opening-hours checks
    ...overrides,
  };
}

/**
 * Build an N×N travel time matrix.
 * Diagonal = 0, off-diagonal = offDiagonal minutes.
 */
function makeMatrix(n: number, offDiagonal = 15): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : offDiagonal))
  );
}

const TEST_OPTS = {
  dailyStartMinutes: 540,  // 09:00
  dailyEndMinutes: 1260,   // 21:00
  travelDate: "2026-07-07", // Tuesday — safe travelDate for hoursUnknown tests
};

// ---------------------------------------------------------------------------
// scheduleSingleDay — reorder=false
// ---------------------------------------------------------------------------

describe("scheduleSingleDay — reorder=false", () => {
  it("keeps given order (placeIds appear in input places[] order)", () => {
    const places = [
      makePlace({ placeId: "A", displayName: "Place A" }),
      makePlace({ placeId: "B", displayName: "Place B" }),
      makePlace({ placeId: "C", displayName: "Place C" }),
    ];
    const matrix = makeMatrix(3, 15);

    const { day } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: false,
      dayNumber: 1,
    });

    expect(day.visits.map((v) => v.placeId)).toEqual(["A", "B", "C"]);
  });

  it("assigns times starting from dailyStartMinutes (09:00)", () => {
    const places = [makePlace({ placeId: "A", visitDurationMinutes: 60 })];
    const matrix = makeMatrix(1);

    const { day } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: false,
      dayNumber: 1,
    });

    // hoursUnknown=true: scheduledStart = dailyStartMinutes (540) = 09:00
    // scheduledEnd = 540 + 60 = 600 = 10:00
    expect(day.visits[0].scheduledStart).toBe("09:00");
    expect(day.visits[0].scheduledEnd).toBe("10:00");
  });

  it("output day.dayNumber equals mode.dayNumber, NOT 1 (relabeling)", () => {
    const places = [makePlace({ placeId: "A" })];
    const matrix = makeMatrix(1);

    const { day } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: false,
      dayNumber: 3, // request dayNumber=3
    });

    // scheduleTimes internally assigns dayNumber=1 (dayIdx+1), but we relabel
    expect(day.dayNumber).toBe(3);
  });

  it("returns empty visits and populated unscheduled when all places are closed on that day", () => {
    // Place open only on Sunday (day: 0), traveling on Monday (2026-07-06 = Monday)
    const sundayOnlyPlace = makePlace({
      placeId: "A",
      hoursUnknown: false,
      openingHours: [
        {
          open: { day: 0, hour: 9, minute: 0 },   // Sunday open
          close: { day: 0, hour: 18, minute: 0 },  // Sunday close
        },
      ],
    });
    const matrix = makeMatrix(1);

    // 2026-07-06 is a Monday (getUTCDay() = 1), but place only open Sunday
    const { day, unscheduled } = scheduleSingleDay(
      [sundayOnlyPlace],
      matrix,
      { ...TEST_OPTS, travelDate: "2026-07-06" },
      { reorder: false, dayNumber: 2 }
    );

    expect(day.visits).toEqual([]);
    expect(unscheduled.length).toBeGreaterThan(0);
    expect(unscheduled[0].placeId).toBe("A");
  });

  it("applies travel time between consecutive places", () => {
    const places = [
      makePlace({ placeId: "A", visitDurationMinutes: 60 }),
      makePlace({ placeId: "B", visitDurationMinutes: 60 }),
    ];
    const matrix = makeMatrix(2, 30); // 30 min travel between any pair

    const { day } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: false,
      dayNumber: 1,
    });

    // A starts at 09:00, ends at 10:00
    // B travels 30 min from A: arrives 10:30, ends 11:30
    expect(day.visits[0].scheduledStart).toBe("09:00");
    expect(day.visits[0].scheduledEnd).toBe("10:00");
    expect(day.visits[1].scheduledStart).toBe("10:30");
    expect(day.visits[1].scheduledEnd).toBe("11:30");
    expect(day.visits[1].travelFromPrevMinutes).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// scheduleSingleDay — reorder=true (stub for plan 06-02)
// ---------------------------------------------------------------------------

describe("scheduleSingleDay — reorder=true (stub)", () => {
  it("throws a clear not-yet-implemented error (implemented in plan 06-02)", () => {
    const places = [makePlace({ placeId: "A" })];
    const matrix = makeMatrix(1);

    expect(() =>
      scheduleSingleDay(places, matrix, TEST_OPTS, { reorder: true, dayNumber: 1 })
    ).toThrow(/06-02|EDIT-02|reorder/i);
  });
});
