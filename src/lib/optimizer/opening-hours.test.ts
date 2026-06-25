import { describe, it, expect } from "vitest";
import { isOpenAt, toLocalMinutes } from "./opening-hours";
import type { OpeningHoursPeriod } from "./types";

describe("isOpenAt", () => {
  // Mon-Fri 09:00-17:00
  const monFriPeriods: OpeningHoursPeriod[] = [
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
    { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } },
    { open: { day: 3, hour: 9, minute: 0 }, close: { day: 3, hour: 17, minute: 0 } },
    { open: { day: 4, hour: 9, minute: 0 }, close: { day: 4, hour: 17, minute: 0 } },
    { open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 17, minute: 0 } },
  ];

  it("returns true when queried Monday at 10:00 (600 min) — within open window", () => {
    // Monday = day 1, 10:00 = 600 minutes
    expect(isOpenAt(monFriPeriods, 1, 600)).toBe(true);
  });

  it("returns false when queried Monday at 18:00 (1080 min) — after close", () => {
    // 18:00 = 1080 minutes; close is at 17:00 = 1020 minutes
    expect(isOpenAt(monFriPeriods, 1, 1080)).toBe(false);
  });

  it("returns false when queried Monday at 08:00 (480 min) — before open", () => {
    // 08:00 = 480 minutes; open is at 09:00 = 540 minutes
    expect(isOpenAt(monFriPeriods, 1, 480)).toBe(false);
  });

  it("returns false when queried on Monday for Sat-Sun only place", () => {
    const weekendOnly: OpeningHoursPeriod[] = [
      { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
      { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 18, minute: 0 } },
    ];
    // Monday = day 1 — should be false
    expect(isOpenAt(weekendOnly, 1, 600)).toBe(false);
  });

  it("returns true for midnight-crossing period (Fri 22:00–Sat 02:00) when queried Sat at 01:00 (60 min)", () => {
    // Period crosses midnight: open day=5 22:00, close day=6 02:00
    const midnightCrossing: OpeningHoursPeriod[] = [
      { open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ];
    // Query: Saturday (day=6) at 01:00 (60 min) — should be true (within the crossing window)
    expect(isOpenAt(midnightCrossing, 6, 60)).toBe(true);
  });

  it("returns false for midnight-crossing period when queried outside the window (Sat at 03:00)", () => {
    const midnightCrossing: OpeningHoursPeriod[] = [
      { open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ];
    // Saturday at 03:00 (180 min) — after close at 02:00
    expect(isOpenAt(midnightCrossing, 6, 180)).toBe(false);
  });

  it("returns true for 24h-open period (period with no close field) at any time that day", () => {
    // A period with no close means open all day
    const alwaysOpen: OpeningHoursPeriod[] = [
      { open: { day: 1, hour: 0, minute: 0 } }, // no close field
    ];
    // Query: Monday at 23:59 (1439 min) — should be true
    expect(isOpenAt(alwaysOpen, 1, 1439)).toBe(true);
    // Query: Monday at 00:00 (0 min) — should be true
    expect(isOpenAt(alwaysOpen, 1, 0)).toBe(true);
  });

  it("returns true for open==close convention (entire day open) at any minute that day", () => {
    // open and close both at same day/time means all-day open
    const allDayOpen: OpeningHoursPeriod[] = [
      { open: { day: 3, hour: 0, minute: 0 }, close: { day: 3, hour: 0, minute: 0 } },
    ];
    // Query: Wednesday (day=3) at any time
    expect(isOpenAt(allDayOpen, 3, 600)).toBe(true);
    expect(isOpenAt(allDayOpen, 3, 1200)).toBe(true);
  });

  it("returns false for empty periods array — no known open window", () => {
    // isOpenAt with empty periods is 'closed' (hoursUnknown handled separately)
    expect(isOpenAt([], 1, 600)).toBe(false);
  });
});

describe("toLocalMinutes", () => {
  it("returns correct dayOfWeek and localMinutes for UTC+8 offset", () => {
    // 2026-06-29T01:00:00Z is a Monday in UTC
    // With utcOffsetMinutes=480 (UTC+8): local time is 2026-06-29T09:00:00+08:00 — Monday 09:00
    // Monday = dayOfWeek=1, 09:00 = localMinutes=540
    const utcEpoch = Date.parse("2026-06-29T01:00:00Z");
    const result = toLocalMinutes(utcEpoch, 480);
    expect(result.dayOfWeek).toBe(1); // Monday
    expect(result.localMinutes).toBe(540); // 09:00 = 9*60 = 540
  });

  it("treats utcOffsetMinutes=null as UTC+0 and does not throw", () => {
    // 2026-06-29T10:30:00Z — Monday at 10:30 UTC
    const utcEpoch = Date.parse("2026-06-29T10:30:00Z");
    // Should not throw; treat null as 0 offset
    expect(() => toLocalMinutes(utcEpoch, null)).not.toThrow();
    const result = toLocalMinutes(utcEpoch, null);
    // Monday at 10:30 UTC → dayOfWeek=1, localMinutes=630
    expect(result.dayOfWeek).toBe(1);
    expect(result.localMinutes).toBe(630);
  });
});
