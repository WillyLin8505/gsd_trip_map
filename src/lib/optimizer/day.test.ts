import { describe, it, expect } from "vitest";
import { classifyPlace, scheduleSingleDay } from "@/lib/optimizer/day";
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

/** Convert "HH:MM" to minutes from midnight. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const TEST_OPTS = {
  dailyStartMinutes: 540,  // 09:00
  dailyEndMinutes: 1260,   // 21:00
  travelDate: "2026-07-07", // Tuesday — safe travelDate for hoursUnknown tests
};

// ---------------------------------------------------------------------------
// classifyPlace
// ---------------------------------------------------------------------------

describe("classifyPlace", () => {
  // Restaurant types
  it("returns 'restaurant' for 'restaurant' type", () => {
    expect(classifyPlace(["restaurant"])).toBe("restaurant");
  });

  it("returns 'restaurant' for 'food' type", () => {
    expect(classifyPlace(["food"])).toBe("restaurant");
  });

  it("returns 'restaurant' for 'meal_takeaway' type", () => {
    expect(classifyPlace(["meal_takeaway"])).toBe("restaurant");
  });

  it("returns 'restaurant' for 'meal_delivery' type", () => {
    expect(classifyPlace(["meal_delivery"])).toBe("restaurant");
  });

  // Snack types
  it("returns 'snack' for 'cafe' type", () => {
    expect(classifyPlace(["cafe"])).toBe("snack");
  });

  it("returns 'snack' for 'bakery' type", () => {
    expect(classifyPlace(["bakery"])).toBe("snack");
  });

  it("returns 'snack' for 'dessert' type", () => {
    expect(classifyPlace(["dessert"])).toBe("snack");
  });

  it("returns 'snack' for 'ice_cream_shop' type", () => {
    expect(classifyPlace(["ice_cream_shop"])).toBe("snack");
  });

  it("returns 'snack' for 'bar' type", () => {
    expect(classifyPlace(["bar"])).toBe("snack");
  });

  // Attraction / fallback
  it("returns 'attraction' for null (Pitfall 4 — missing place_types)", () => {
    expect(classifyPlace(null)).toBe("attraction");
  });

  it("returns 'attraction' for empty array", () => {
    expect(classifyPlace([])).toBe("attraction");
  });

  it("returns 'attraction' for unknown place type strings", () => {
    expect(classifyPlace(["tourist_attraction", "museum", "park"])).toBe("attraction");
  });

  // Tie-breaking: restaurant wins
  it("restaurant wins when place has BOTH a restaurant type and a snack type", () => {
    expect(classifyPlace(["restaurant", "cafe"])).toBe("restaurant");
  });

  it("restaurant wins meal_takeaway + bar tie", () => {
    expect(classifyPlace(["bar", "meal_takeaway"])).toBe("restaurant");
  });
});

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
// scheduleSingleDay — reorder=true (F2 auto-arrange)
//
// Matrix: all off-diagonal = 90 min travel, diagonal = 0.
// Duration: 60 min per place. hoursUnknown=true throughout.
// Lunch window:  arrival in [690, 810) = [11:30, 13:30)
// Dinner window: arrival in [1050, 1170) = [17:30, 19:30)
//
// Clock-walk trace for 2 attractions + 1 restaurant (matrix all 90):
//   k=0: A1 arrival=540, not lunch → push A1, time=600
//   k=1: A2 arrival=600+90=690 → LUNCH! Insert R1 before A2
//         push R1, time=750; push A2, time=900
//   finalOrder=[A1, R1, A2] → scheduleTimes assigns R1.start=690 ("11:30") ✓
// ---------------------------------------------------------------------------

describe("scheduleSingleDay — reorder=true", () => {
  it("no restaurants → plain shortest-path: all attractions scheduled, unscheduled empty", () => {
    const places = [
      makePlace({ placeId: "A1", placeTypes: ["tourist_attraction"] }),
      makePlace({ placeId: "A2", placeTypes: ["museum"] }),
      makePlace({ placeId: "A3", placeTypes: null }), // null → attraction too
    ];
    const matrix = makeMatrix(3, 30);

    const { day, unscheduled } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: true,
      dayNumber: 1,
    });

    // All 3 places scheduled (hoursUnknown=true), no restaurants → no meal slotting
    expect(unscheduled).toHaveLength(0);
    expect(day.visits).toHaveLength(3);
    const visitIds = day.visits.map((v) => v.placeId);
    expect(visitIds).toContain("A1");
    expect(visitIds).toContain("A2");
    expect(visitIds).toContain("A3");
  });

  it("one restaurant → slotted in lunch window (11:30–13:30)", () => {
    // Clock-walk: 2 attractions + 1 restaurant, matrix all 90
    // At k=1 (A2), arrival=690 → LUNCH → R1 inserted before A2
    const places = [
      makePlace({ placeId: "A1", visitDurationMinutes: 60, placeTypes: ["museum"] }),
      makePlace({ placeId: "A2", visitDurationMinutes: 60, placeTypes: ["park"] }),
      makePlace({ placeId: "R1", visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
    ];
    const matrix = makeMatrix(3, 90);

    const { day, unscheduled } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: true,
      dayNumber: 2,
    });

    expect(unscheduled).toHaveLength(0);
    expect(day.dayNumber).toBe(2);

    const r1Visit = day.visits.find((v) => v.placeId === "R1");
    expect(r1Visit).toBeDefined();
    // R1 must start within the lunch window [690, 810) = [11:30, 13:30)
    const startMin = hhmmToMinutes(r1Visit!.scheduledStart);
    expect(startMin).toBeGreaterThanOrEqual(690); // >= 11:30
    expect(startMin).toBeLessThan(810);           // < 13:30
  });

  it("two restaurants → one in lunch window, one in dinner window", () => {
    // 4 attractions + 2 restaurants, matrix all 90, duration 60
    // Trace:
    //   k=0: A1 arrival=540 → push A1, time=600
    //   k=1: A2 arrival=690 → LUNCH! Insert R1, push A2, time=900
    //   k=2: A3 arrival=990 → not dinner (1050), push A3, time=1050
    //   k=3: A4 arrival=1140 → DINNER! Insert R2, push A4, time=1350
    // finalOrder=[A1,R1,A2,A3,R2,A4]
    // scheduleTimes: R1.start=690 ("11:30"), R2.start=1140 ("19:00")
    const places = [
      makePlace({ placeId: "A1", visitDurationMinutes: 60, placeTypes: ["museum"] }),
      makePlace({ placeId: "A2", visitDurationMinutes: 60, placeTypes: ["park"] }),
      makePlace({ placeId: "A3", visitDurationMinutes: 60, placeTypes: ["tourist_attraction"] }),
      makePlace({ placeId: "A4", visitDurationMinutes: 60, placeTypes: ["amusement_park"] }),
      makePlace({ placeId: "R1", visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
      makePlace({ placeId: "R2", visitDurationMinutes: 60, placeTypes: ["food"] }),
    ];
    const matrix = makeMatrix(6, 90);

    const { day } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: true,
      dayNumber: 1,
    });

    const r1Visit = day.visits.find((v) => v.placeId === "R1");
    expect(r1Visit).toBeDefined();
    const r1Start = hhmmToMinutes(r1Visit!.scheduledStart);
    expect(r1Start).toBeGreaterThanOrEqual(690);  // >= 11:30
    expect(r1Start).toBeLessThan(810);             // < 13:30

    const r2Visit = day.visits.find((v) => v.placeId === "R2");
    expect(r2Visit).toBeDefined();
    const r2Start = hhmmToMinutes(r2Visit!.scheduledStart);
    expect(r2Start).toBeGreaterThanOrEqual(1050); // >= 17:30
    expect(r2Start).toBeLessThan(1170);           // < 19:30
  });

  it(">2 restaurants → extras placed in route order; all 5 places accounted for", () => {
    // 2 attractions + 3 restaurants: lunch window triggers for R1 only,
    // R2 and R3 fall into rPool and are appended in route order.
    // finalOrder=[A1, R1, A2, R2, R3] → all 5 places in day.visits
    const places = [
      makePlace({ placeId: "A1", visitDurationMinutes: 60, placeTypes: ["museum"] }),
      makePlace({ placeId: "A2", visitDurationMinutes: 60, placeTypes: ["park"] }),
      makePlace({ placeId: "R1", visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
      makePlace({ placeId: "R2", visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
      makePlace({ placeId: "R3", visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
    ];
    const matrix = makeMatrix(5, 90);

    const { day, unscheduled } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: true,
      dayNumber: 1,
    });

    // All 5 places must be accounted for (in visits or unscheduled)
    const scheduledIds = day.visits.map((v) => v.placeId);
    const unscheduledIds = unscheduled.map((u) => u.placeId);
    const allOutputIds = new Set([...scheduledIds, ...unscheduledIds]);
    expect(allOutputIds.size).toBe(5);
    expect(allOutputIds.has("R3")).toBe(true); // extra restaurant must appear

    // Only the lunch window triggers (no dinner — walk only has 2 A iterations)
    const r1Visit = day.visits.find((v) => v.placeId === "R1");
    expect(r1Visit).toBeDefined();
    const r1Start = hhmmToMinutes(r1Visit!.scheduledStart);
    expect(r1Start).toBeGreaterThanOrEqual(690);
    expect(r1Start).toBeLessThan(810);
  });

  it("null place_types classifies as attraction (Pitfall 4) — no meal slot for that place", () => {
    // Null-typed place goes to A set; R1 gets the lunch slot
    // A=[0 (null), 2 (museum)], R=[1 (restaurant)]
    // orderedAFull=[0,2], clock walk triggers lunch at k=1: insert R1 before place[2]
    const places = [
      makePlace({ placeId: "NULL_TYPE", visitDurationMinutes: 60, placeTypes: null }),
      makePlace({ placeId: "R1",        visitDurationMinutes: 60, placeTypes: ["restaurant"] }),
      makePlace({ placeId: "A1",        visitDurationMinutes: 60, placeTypes: ["museum"] }),
    ];
    const matrix = makeMatrix(3, 90);

    const { day, unscheduled } = scheduleSingleDay(places, matrix, TEST_OPTS, {
      reorder: true,
      dayNumber: 1,
    });

    expect(unscheduled).toHaveLength(0);

    // R1 must be in lunch window (null-typed place is in A set, not R set)
    const r1Visit = day.visits.find((v) => v.placeId === "R1");
    expect(r1Visit).toBeDefined();
    const startMin = hhmmToMinutes(r1Visit!.scheduledStart);
    expect(startMin).toBeGreaterThanOrEqual(690);
    expect(startMin).toBeLessThan(810);

    // null-typed place must also appear in visits (it's an attraction, scheduled normally)
    const nullVisit = day.visits.find((v) => v.placeId === "NULL_TYPE");
    expect(nullVisit).toBeDefined();
  });
});
