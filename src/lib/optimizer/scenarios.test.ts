/**
 * Three mandatory scenario tests against the locked 02-CONTEXT.md response contract.
 *
 * ALL tests use hand-constructed OptimizerPlace[] + matrices — zero API/DB calls.
 * These tests guard the end-to-end optimize() output against the API contract shape.
 *
 * Scenario A (N=5, normal hours): straightforward scheduling, no violations
 * Scenario B (N=10, mixed hours): Monday-closed + 17:00-closer correctly handled
 * Scenario C (N=20, hoursUnknown): all unknown-hours places retain slots + warnings
 */

import { describe, it, expect } from "vitest";
import { optimize } from "./index";
import type { OptimizerInput, OptimizerPlace, TravelMatrix } from "./types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function allDaysOpen(openHour: number, closeHour: number): OptimizerPlace["openingHours"] {
  return Array.from({ length: 7 }, (_, day) => ({
    open: { day, hour: openHour, minute: 0 },
    close: { day, hour: closeHour, minute: 0 },
  }));
}

function uniformMatrix(n: number, travelMin: number): TravelMatrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 0 : travelMin))
  );
}

function makePlace(
  id: string,
  overrides: Partial<OptimizerPlace> = {}
): OptimizerPlace {
  return {
    placeId: id,
    displayName: `Place ${id}`,
    lat: 25.0,
    lng: 121.5,
    openingHours: allDaysOpen(9, 18),
    utcOffsetMinutes: 480,
    visitDurationMinutes: 60,
    hoursUnknown: false,
    ...overrides,
  };
}

// Monday 2026-06-29 (dayOfWeek=1 in JS getUTCDay / Google convention)
const MONDAY = "2026-06-29";

// ---------------------------------------------------------------------------
// Scenario A: N=5, all open 09:00-18:00 daily
// ---------------------------------------------------------------------------

describe("Scenario A: N=5, all open 09:00-18:00 daily", () => {
  const places: OptimizerPlace[] = Array.from({ length: 5 }, (_, i) =>
    makePlace(`a${i}`, { visitDurationMinutes: 90 })
  );
  // Uniform 20-min travel
  const matrix = uniformMatrix(5, 20);
  const input: OptimizerInput = {
    places,
    matrix,
    travelDate: MONDAY,
  };

  it("returns 1 or 2 days (all fit within the daily window)", () => {
    // 5 × 90 min visits + 4 × 20 min travel = 530 min < 720 → should be 1 day
    const result = optimize(input);
    expect(result.days.length).toBeGreaterThanOrEqual(1);
    expect(result.days.length).toBeLessThanOrEqual(2);
  });

  it("unscheduled is empty (all places fit within opening hours)", () => {
    const result = optimize(input);
    expect(result.unscheduled).toHaveLength(0);
  });

  it("every visit's scheduledEnd is at or before 18:00", () => {
    const result = optimize(input);
    for (const day of result.days) {
      for (const visit of day.visits) {
        const [h, m] = visit.scheduledEnd.split(":").map(Number);
        const endMin = h * 60 + m;
        expect(endMin).toBeLessThanOrEqual(18 * 60); // ≤ 18:00 (1080)
      }
    }
  });

  it("conservation: all 5 places accounted for", () => {
    const result = optimize(input);
    const allIds = [
      ...result.days.flatMap((d) => d.visits.map((v) => v.placeId)),
      ...result.unscheduled.map((u) => u.placeId),
    ];
    expect(allIds.length).toBe(5);
    expect(new Set(allIds).size).toBe(5);
  });

  it("result matches OptimizeResult contract shape", () => {
    const result = optimize(input);
    expect(result).toHaveProperty("suggestedDays");
    expect(result).toHaveProperty("days");
    expect(result).toHaveProperty("unscheduled");
    expect(Array.isArray(result.days)).toBe(true);
    expect(Array.isArray(result.unscheduled)).toBe(true);
    for (const day of result.days) {
      expect(typeof day.dayNumber).toBe("number");
      expect(Array.isArray(day.visits)).toBe(true);
      for (const v of day.visits) {
        expect(typeof v.placeId).toBe("string");
        expect(typeof v.displayName).toBe("string");
        expect(v.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
        expect(v.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
        expect(typeof v.travelFromPrevMinutes).toBe("number");
        expect(typeof v.waitMinutes).toBe("number");
        expect(typeof v.hoursUnknown).toBe("boolean");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario B: N=10, mixed hours (one closed Mondays, one closes at 17:00)
// ---------------------------------------------------------------------------

describe("Scenario B: N=10, mixed opening hours", () => {
  // Place b1: closed on Mondays (only Tue-Sun 09:00-18:00)
  const mondayClosedHours = Array.from({ length: 6 }, (_, i) => ({
    // days 2,3,4,5,6,0 = Tue,Wed,Thu,Fri,Sat,Sun
    open: { day: [0, 2, 3, 4, 5, 6][i], hour: 9, minute: 0 },
    close: { day: [0, 2, 3, 4, 5, 6][i], hour: 18, minute: 0 },
  }));

  // Place b2: closes early at 17:00 (all days)
  const earlyCloseHours = allDaysOpen(9, 17);

  const places: OptimizerPlace[] = [
    makePlace("b0", { visitDurationMinutes: 60 }),
    makePlace("b1", {
      visitDurationMinutes: 60,
      openingHours: mondayClosedHours, // closed on Monday
    }),
    makePlace("b2", {
      visitDurationMinutes: 60,
      openingHours: earlyCloseHours, // closes at 17:00
    }),
    ...Array.from({ length: 7 }, (_, i) =>
      makePlace(`b${i + 3}`, { visitDurationMinutes: 60 })
    ),
  ];

  const matrix = uniformMatrix(10, 15);

  // travelDate = Monday 2026-06-29
  const input: OptimizerInput = {
    places,
    matrix,
    travelDate: MONDAY,
  };

  it("the Monday-closed place (b1) is in unscheduled on a Monday trip", () => {
    const result = optimize(input);
    // b1 should be unscheduled since Monday is not in its hours
    const unscheduledIds = result.unscheduled.map((u) => u.placeId);
    expect(unscheduledIds).toContain("b1");
  });

  it("the 17:00-closer (b2) is never scheduled with a scheduledEnd after 17:00", () => {
    const result = optimize(input);
    const b2Visits = result.days.flatMap((d) =>
      d.visits.filter((v) => v.placeId === "b2")
    );
    for (const v of b2Visits) {
      const [h, m] = v.scheduledEnd.split(":").map(Number);
      const endMin = h * 60 + m;
      expect(endMin).toBeLessThanOrEqual(17 * 60); // ≤ 17:00 (1020)
    }
  });

  it("conservation: all 10 places accounted for", () => {
    const result = optimize(input);
    const allIds = [
      ...result.days.flatMap((d) => d.visits.map((v) => v.placeId)),
      ...result.unscheduled.map((u) => u.placeId),
    ];
    expect(allIds.length).toBe(10);
    expect(new Set(allIds).size).toBe(10);
  });

  it("unscheduled entries each have a non-empty reason string", () => {
    const result = optimize(input);
    for (const u of result.unscheduled) {
      expect(typeof u.reason).toBe("string");
      expect(u.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario C: N=20, several hoursUnknown=true places
// ---------------------------------------------------------------------------

describe("Scenario C: N=20, several hoursUnknown=true places", () => {
  // 6 places with unknown hours, 14 with normal hours
  const places: OptimizerPlace[] = [
    ...Array.from({ length: 14 }, (_, i) =>
      makePlace(`c${i}`, { visitDurationMinutes: 45 })
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      makePlace(`cu${i}`, {
        visitDurationMinutes: 45,
        openingHours: null,
        hoursUnknown: true,
      })
    ),
  ];

  const matrix = uniformMatrix(20, 20);

  const input: OptimizerInput = {
    places,
    matrix,
    travelDate: MONDAY,
  };

  it("completes without throwing", () => {
    expect(() => optimize(input)).not.toThrow();
  });

  it("total places accounted for === 20", () => {
    const result = optimize(input);
    const allIds = [
      ...result.days.flatMap((d) => d.visits.map((v) => v.placeId)),
      ...result.unscheduled.map((u) => u.placeId),
    ];
    expect(allIds.length).toBe(20);
    expect(new Set(allIds).size).toBe(20);
  });

  it("every hoursUnknown place has hoursUnknown:true in visits output", () => {
    const result = optimize(input);
    const hoursUnknownPlaceIds = places
      .filter((p) => p.hoursUnknown)
      .map((p) => p.placeId);

    for (const id of hoursUnknownPlaceIds) {
      // Must be in visits, not in unscheduled
      const inVisits = result.days.some((d) =>
        d.visits.some((v) => v.placeId === id)
      );
      const inUnscheduled = result.unscheduled.some((u) => u.placeId === id);

      expect(inVisits).toBe(true);
      expect(inUnscheduled).toBe(false);

      // The visit must have hoursUnknown:true and a non-empty warning
      const visit = result.days
        .flatMap((d) => d.visits)
        .find((v) => v.placeId === id);
      expect(visit!.hoursUnknown).toBe(true);
      expect(visit!.warning).toBeTruthy();
      expect(visit!.warning!.length).toBeGreaterThan(0);
    }
  });

  it("hoursUnknown places are never in unscheduled", () => {
    const result = optimize(input);
    const hoursUnknownIds = places
      .filter((p) => p.hoursUnknown)
      .map((p) => p.placeId);
    const unscheduledIds = result.unscheduled.map((u) => u.placeId);

    for (const id of hoursUnknownIds) {
      expect(unscheduledIds).not.toContain(id);
    }
  });

  it("result has valid OptimizeResult contract fields", () => {
    const result = optimize(input);
    expect(typeof result.suggestedDays).toBe("number");
    expect(result.suggestedDays).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.days)).toBe(true);
    expect(Array.isArray(result.unscheduled)).toBe(true);
  });
});
