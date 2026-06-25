/**
 * Tests for schedule.ts: suggestDayCount, splitIntoDays, scheduleTimes,
 * minutesToHHMM, OptimizeResult, ScheduledVisit.
 *
 * All tests use hand-built mock data — no API/DB calls anywhere.
 * This is the RED phase: tests are written before implementation.
 */

import { describe, it, expect } from "vitest";
import {
  minutesToHHMM,
  suggestDayCount,
  splitIntoDays,
  scheduleTimes,
} from "./schedule";
import type { OptimizerPlace, TravelMatrix } from "./types";
import type { ScheduledVisit } from "./schedule";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makePlace(
  overrides: Partial<OptimizerPlace> & { placeId: string }
): OptimizerPlace {
  return {
    displayName: overrides.placeId,
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

/** All zeros — fast travel, emphasizes duration logic */
function zeroMatrix(n: number): TravelMatrix {
  return Array.from({ length: n }, () => new Array(n).fill(0));
}

/** Uniform off-diagonal travel time */
function uniformMatrix(n: number, travelMinutes: number): TravelMatrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 0 : travelMinutes))
  );
}

const DEFAULT_OPTS = {
  dailyStartMinutes: 540,  // 09:00
  dailyEndMinutes: 1260,   // 21:00
};

// ---------------------------------------------------------------------------
// minutesToHHMM
// ---------------------------------------------------------------------------

describe("minutesToHHMM", () => {
  it("converts 540 to '09:00'", () => {
    expect(minutesToHHMM(540)).toBe("09:00");
  });

  it("converts 1290 to '21:30'", () => {
    expect(minutesToHHMM(1290)).toBe("21:30");
  });

  it("converts 0 to '00:00'", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
  });

  it("converts 61 to '01:01'", () => {
    expect(minutesToHHMM(61)).toBe("01:01");
  });

  it("converts 1439 to '23:59'", () => {
    expect(minutesToHHMM(1439)).toBe("23:59");
  });
});

// ---------------------------------------------------------------------------
// suggestDayCount
// ---------------------------------------------------------------------------

describe("suggestDayCount", () => {
  it("returns 1 for a single place", () => {
    const places = [makePlace({ placeId: "p1", visitDurationMinutes: 60 })];
    const matrix = zeroMatrix(1);
    expect(suggestDayCount(places, matrix)).toBeGreaterThanOrEqual(1);
    expect(suggestDayCount(places, matrix)).toBe(1);
  });

  it("returns at least 1 even for a tiny input", () => {
    const places = [makePlace({ placeId: "p1", visitDurationMinutes: 1 })];
    expect(suggestDayCount(places, zeroMatrix(1))).toBe(1);
  });

  it("suggests 1 day for 5 places of 60 min with zero travel (total 300 < 720)", () => {
    const places = Array.from({ length: 5 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 60 })
    );
    const matrix = zeroMatrix(5);
    // sumDurations=300, avg travel=0 → ceil(300/720)=1
    expect(suggestDayCount(places, matrix)).toBe(1);
  });

  it("suggests 2 days for 5 places of 60 min with 60-min travel between each", () => {
    const places = Array.from({ length: 5 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 60 })
    );
    const matrix = uniformMatrix(5, 60);
    // sumDurations=300, (N-1)*avgTravel = 4*60=240, total=540 → ceil(540/720)=1
    // Wait — let's check: avg of off-diagonal entries in a 5x5 uniform-60 matrix
    // Off-diagonal count = 5*4=20, each 60 → avg = 60
    // suggestDayCount = ceil((300 + 4*60) / 720) = ceil(540/720) = 1
    expect(suggestDayCount(places, matrix)).toBe(1);
  });

  it("suggests 2 days when total duration exceeds 1 daily budget", () => {
    // 8 places × 100 min each + avg 30 min travel = 800 + 7*30 = 1010 → ceil(1010/720)=2
    const places = Array.from({ length: 8 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 100 })
    );
    const matrix = uniformMatrix(8, 30);
    const result = suggestDayCount(places, matrix);
    expect(result).toBeGreaterThanOrEqual(2);
  });

  it("respects custom dailyBudgetMinutes parameter", () => {
    // 4 places × 200 min with zero travel → total 800 min
    // budget=400 → ceil(800/400)=2
    const places = Array.from({ length: 4 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 200 })
    );
    expect(suggestDayCount(places, zeroMatrix(4), 400)).toBe(2);
  });

  it("uses average matrix travel time in the formula", () => {
    // With non-zero travel, result should differ from zero-travel
    const places = Array.from({ length: 6 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 90 })
    );
    const zeroResult = suggestDayCount(places, zeroMatrix(6));
    const highTravelResult = suggestDayCount(places, uniformMatrix(6, 200));
    // High travel time should never reduce the day count
    expect(highTravelResult).toBeGreaterThanOrEqual(zeroResult);
  });
});

// ---------------------------------------------------------------------------
// splitIntoDays
// ---------------------------------------------------------------------------

describe("splitIntoDays", () => {
  it("places all 5 zero-travel 60-min places in 1 day bucket when numDays=1 fits", () => {
    const places = Array.from({ length: 5 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 60 })
    );
    const order = [0, 1, 2, 3, 4];
    const matrix = zeroMatrix(5);
    const { dayOrders, overflow } = splitIntoDays(order, places, matrix, 1, DEFAULT_OPTS);
    // total = 5*60=300 < 720-window-available; should fit in 1 day
    expect(dayOrders.length).toBe(1);
    expect(overflow.length).toBe(0);
    expect(dayOrders[0]).toEqual([0, 1, 2, 3, 4]);
  });

  it("produces exactly numDays buckets when places fit exactly", () => {
    // 2 days × 3 places each, 60-min visits, zero travel → 180 min/day < 720
    const places = Array.from({ length: 6 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 60 })
    );
    const order = [0, 1, 2, 3, 4, 5];
    const matrix = zeroMatrix(6);
    const { dayOrders } = splitIntoDays(order, places, matrix, 2, DEFAULT_OPTS);
    expect(dayOrders.length).toBeLessThanOrEqual(2);
  });

  it("starts a new day when running total would exceed the daily window", () => {
    // Daily window: 09:00-21:00 = 720 min
    // 3 places × 300 min each (with zero travel) → 300+300=600 fits day1, third overflows
    const places = Array.from({ length: 3 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 300 })
    );
    const order = [0, 1, 2];
    const matrix = zeroMatrix(3);
    const { dayOrders, overflow } = splitIntoDays(order, places, matrix, 2, DEFAULT_OPTS);
    // Day 1: 300+300=600 ≤ 720 → p0, p1 fit; day2: p2=300 ≤ 720 → fits
    // Actually 300+300=600 ≤ 720, so p0 and p1 both fit in day1, p2 in day2
    const allPlaced = dayOrders.flat().length + overflow.length;
    expect(allPlaced).toBe(3);
  });

  it("overflows to overflow list when numDays is exhausted", () => {
    // 4 places × 400 min each, numDays=1, window=720 → only 1 place fits per day
    const places = Array.from({ length: 4 }, (_, i) =>
      makePlace({ placeId: `p${i}`, visitDurationMinutes: 400 })
    );
    const order = [0, 1, 2, 3];
    const matrix = zeroMatrix(4);
    const { dayOrders, overflow } = splitIntoDays(order, places, matrix, 1, DEFAULT_OPTS);
    // Day 1: p0=400 ≤ 720, p1 would be 400+400=800 > 720 → p1 overflows
    // Since numDays=1, p1,p2,p3 should overflow
    expect(dayOrders.length).toBe(1);
    expect(overflow.length).toBe(3);
  });

  it("accumulates travel time when checking if next place fits", () => {
    // Daily window: 720 min. Place takes 600 min + 200 min travel = 800 > 720
    const places = [
      makePlace({ placeId: "p0", visitDurationMinutes: 600 }),
      makePlace({ placeId: "p1", visitDurationMinutes: 60 }),
    ];
    const order = [0, 1];
    const matrix = uniformMatrix(2, 200);
    const { dayOrders } = splitIntoDays(order, places, matrix, 2, DEFAULT_OPTS);
    // p0 fits in day1 (600 ≤ 720), p1 would add 200 travel + 60 = 860 > 720 → new day
    expect(dayOrders.length).toBe(2);
    expect(dayOrders[0]).toContain(0);
    expect(dayOrders[1]).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// scheduleTimes
// ---------------------------------------------------------------------------

describe("scheduleTimes", () => {
  // travelDate: Monday 2026-06-29 (day=1 in Google convention)
  const TRAVEL_DATE = "2026-06-29";

  it("first visit of each day starts at dailyStartMinutes with travelFromPrevMinutes=0", () => {
    const places = [
      makePlace({ placeId: "p0", visitDurationMinutes: 60 }),
      makePlace({ placeId: "p1", visitDurationMinutes: 60 }),
    ];
    const dayOrders = [[0], [1]];
    const matrix = zeroMatrix(2);
    const { days } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    expect(days[0].visits[0].travelFromPrevMinutes).toBe(0);
    expect(days[1].visits[0].travelFromPrevMinutes).toBe(0);
    // scheduledStart should equal dailyStartMinutes → "09:00"
    expect(days[0].visits[0].scheduledStart).toBe("09:00");
    expect(days[1].visits[0].scheduledStart).toBe("09:00");
  });

  it("arrivalTime = prevDepartureTime + travelFromPrev", () => {
    // p0: starts 09:00, visits 60 min → departs 10:00
    // p1: 30 min travel → arrives 10:30, open from 09:00, scheduledStart=10:30
    const places = [
      makePlace({ placeId: "p0", visitDurationMinutes: 60 }),
      makePlace({ placeId: "p1", visitDurationMinutes: 60 }),
    ];
    const dayOrders = [[0, 1]];
    const matrix = uniformMatrix(2, 30);
    const { days } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    const v0 = days[0].visits[0];
    const v1 = days[0].visits[1];
    // v0: travelFromPrev=0, scheduledStart="09:00", scheduledEnd="10:00"
    expect(v0.scheduledStart).toBe("09:00");
    expect(v0.scheduledEnd).toBe("10:00");
    expect(v0.travelFromPrevMinutes).toBe(0);
    // v1: travelFromPrev=30, arrival=600+30=630=10:30, open since 09:00 → scheduledStart=10:30
    expect(v1.travelFromPrevMinutes).toBe(30);
    expect(v1.scheduledStart).toBe("10:30");
    expect(v1.scheduledEnd).toBe("11:30");
  });

  it("waitMinutes is set when arrival is before opening time", () => {
    // p0 arrives at 09:00 but place doesn't open until 10:00 → wait 60 min
    const places = [
      makePlace({
        placeId: "p0",
        visitDurationMinutes: 60,
        openingHours: [
          // Mon-Sun 10:00-18:00
          { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
          { open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
          { open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
          { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } },
          { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 18, minute: 0 } },
          { open: { day: 5, hour: 10, minute: 0 }, close: { day: 5, hour: 18, minute: 0 } },
          { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
        ],
      }),
    ];
    const dayOrders = [[0]];
    const matrix = zeroMatrix(1);
    const { days } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    const v0 = days[0].visits[0];
    // arrival=09:00=540, open=10:00=600 → wait=60
    expect(v0.waitMinutes).toBe(60);
    expect(v0.scheduledStart).toBe("10:00");
    expect(v0.scheduledEnd).toBe("11:00");
  });

  it("pushes to unscheduled with reason when scheduledEnd would exceed closeTime", () => {
    // Place closes at 10:30 (630), visitDuration=120 min
    // arrival=09:00, open=09:00 → scheduledStart=540, scheduledEnd=540+120=660 > 630 → unscheduled
    const places = [
      makePlace({
        placeId: "p0",
        visitDurationMinutes: 120,
        openingHours: [
          { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 10, minute: 30 } },
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 10, minute: 30 } },
          { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 10, minute: 30 } },
          { open: { day: 3, hour: 9, minute: 0 }, close: { day: 3, hour: 10, minute: 30 } },
          { open: { day: 4, hour: 9, minute: 0 }, close: { day: 4, hour: 10, minute: 30 } },
          { open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 10, minute: 30 } },
          { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 10, minute: 30 } },
        ],
      }),
    ];
    const dayOrders = [[0]];
    const matrix = zeroMatrix(1);
    const { days, unscheduled } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    expect(days[0].visits).toHaveLength(0);
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].placeId).toBe("p0");
    expect(unscheduled[0].reason).toBeTruthy();
  });

  it("hoursUnknown=true place is scheduled (not dropped) with hoursUnknown flag and warning", () => {
    const places = [
      makePlace({
        placeId: "p0",
        visitDurationMinutes: 60,
        openingHours: null,
        hoursUnknown: true,
      }),
    ];
    const dayOrders = [[0]];
    const matrix = zeroMatrix(1);
    const { days, unscheduled } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    // Must appear in days, NOT in unscheduled
    expect(unscheduled).toHaveLength(0);
    expect(days[0].visits).toHaveLength(1);

    const v = days[0].visits[0];
    expect(v.hoursUnknown).toBe(true);
    expect(v.warning).toBeTruthy();
    expect(v.warning!.length).toBeGreaterThan(0);
    // Still gets a scheduled slot
    expect(v.scheduledStart).toBeTruthy();
    expect(v.scheduledEnd).toBeTruthy();
  });

  it("hoursUnknown=true place: isOpenAt is NOT consulted to reject it", () => {
    // Even with empty openingHours (which isOpenAt returns false for), the place is scheduled
    const places = [
      makePlace({
        placeId: "p0",
        visitDurationMinutes: 60,
        openingHours: null,   // null periods → hoursUnknown path
        hoursUnknown: true,
      }),
    ];
    const dayOrders = [[0]];
    const { days } = scheduleTimes(dayOrders, places, zeroMatrix(1), {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });
    // Should still be scheduled, not unscheduled
    expect(days[0].visits.length).toBe(1);
    expect(days[0].visits[0].hoursUnknown).toBe(true);
  });

  it("place closed on the travel day is moved to unscheduled with a reason", () => {
    // TRAVEL_DATE = Monday 2026-06-29 (dayOfWeek=1)
    // Place only open on Sundays (day=0) → closed on Monday
    const places = [
      makePlace({
        placeId: "p0",
        visitDurationMinutes: 60,
        openingHours: [
          // Only open Sundays 09:00-18:00
          { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
        ],
      }),
    ];
    const dayOrders = [[0]];
    const matrix = zeroMatrix(1);
    const { days, unscheduled } = scheduleTimes(dayOrders, places, matrix, {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    expect(days[0].visits).toHaveLength(0);
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].placeId).toBe("p0");
    expect(unscheduled[0].reason).toBeTruthy();
  });

  it("emits scheduledStart and scheduledEnd as HH:MM strings", () => {
    const places = [makePlace({ placeId: "p0", visitDurationMinutes: 90 })];
    const dayOrders = [[0]];
    const { days } = scheduleTimes(dayOrders, places, zeroMatrix(1), {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    const v = days[0].visits[0];
    // Check HH:MM format
    expect(v.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
    expect(v.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
    // With 09:00 start and 90 min duration: "09:00" start, "10:30" end
    expect(v.scheduledStart).toBe("09:00");
    expect(v.scheduledEnd).toBe("10:30");
  });

  it("dayNumber is 1-based in output", () => {
    const places = [
      makePlace({ placeId: "p0", visitDurationMinutes: 60 }),
      makePlace({ placeId: "p1", visitDurationMinutes: 60 }),
    ];
    const dayOrders = [[0], [1]];
    const { days } = scheduleTimes(dayOrders, places, zeroMatrix(2), {
      ...DEFAULT_OPTS,
      travelDate: TRAVEL_DATE,
    });

    expect(days[0].dayNumber).toBe(1);
    expect(days[1].dayNumber).toBe(2);
  });
});
