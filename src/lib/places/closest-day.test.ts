import { describe, it, expect } from "vitest";
import { pickClosestDay, type DayWithCoords } from "@/lib/places/closest-day";

describe("pickClosestDay", () => {
  it("picks the day whose places are nearest to the new place", () => {
    const days: DayWithCoords[] = [
      {
        dayNumber: 1,
        visits: [{ lat: 25.0, lng: 121.5 }], // Taipei cluster
      },
      {
        dayNumber: 2,
        visits: [{ lat: 35.6, lng: 139.7 }], // Tokyo cluster (far away)
      },
    ];
    // New place near day 1 cluster (Taipei)
    const result = pickClosestDay({ lat: 25.01, lng: 121.51 }, days);
    expect(result).toBe(1);
  });

  it("handles single-day itinerary (always returns that day)", () => {
    const days: DayWithCoords[] = [
      {
        dayNumber: 1,
        visits: [{ lat: 25.0, lng: 121.5 }],
      },
    ];
    // New place far from day 1 — but there's only one day, so must return 1
    const result = pickClosestDay({ lat: 50.0, lng: 100.0 }, days);
    expect(result).toBe(1);
  });

  it("skips days with empty visits array", () => {
    const days: DayWithCoords[] = [
      {
        dayNumber: 1,
        visits: [], // Empty — must be skipped
      },
      {
        dayNumber: 2,
        visits: [{ lat: 25.0, lng: 121.5 }],
      },
    ];
    // Day 1 is empty, day 2 has the only visit
    const result = pickClosestDay({ lat: 25.01, lng: 121.51 }, days);
    expect(result).toBe(2);
  });

  it("returns the first-encountered day when distances are equal (stable tie-breaking)", () => {
    // Two days at equal distance from newPlace (midpoint)
    const days: DayWithCoords[] = [
      {
        dayNumber: 1,
        visits: [{ lat: 25.0, lng: 121.0 }],
      },
      {
        dayNumber: 2,
        visits: [{ lat: 25.0, lng: 122.0 }],
      },
    ];
    // New place exactly equidistant: (25.0, 121.5) is ~same distance to both
    const result = pickClosestDay({ lat: 25.0, lng: 121.5 }, days);
    // Strict less-than comparison means the first day wins on equal distance
    expect(result).toBe(1);
  });

  it("works with multiple visits per day, taking the minimum distance", () => {
    const days: DayWithCoords[] = [
      {
        dayNumber: 1,
        visits: [
          { lat: 35.0, lng: 139.0 }, // Far
          { lat: 35.0, lng: 138.0 }, // Further
        ],
      },
      {
        dayNumber: 2,
        visits: [
          { lat: 25.0, lng: 121.5 }, // Close
          { lat: 35.0, lng: 139.5 }, // Far
        ],
      },
    ];
    // New place near day 2's first visit
    const result = pickClosestDay({ lat: 25.01, lng: 121.51 }, days);
    expect(result).toBe(2);
  });
});
