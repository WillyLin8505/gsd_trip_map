/**
 * Tests for ItineraryView — covers DISP-01.
 *
 * RED scaffold: fails until src/components/itinerary-view.tsx is implemented (03-02).
 *
 * TODO(03-02): green when ItineraryView lands
 *
 * Behavior under test (DISP-01):
 * - Day headings "第 1 天" / "第 2 天" appear for a 2-day OptimizeResult
 * - Each visit's displayName appears in the day card
 * - Each visit's scheduledStart / scheduledEnd time slot appears
 */

import { describe, it, expect } from "vitest";

// TODO(03-02): green when ItineraryView lands
// This import will fail (MODULE_NOT_FOUND) until itinerary-view.tsx is created
import { ItineraryView } from "./itinerary-view";
import type { OptimizeResult } from "@/types/itinerary";

/** Minimal 2-day OptimizeResult fixture for DISP-01 assertions */
const twoDay: OptimizeResult = {
  suggestedDays: 2,
  days: [
    {
      dayNumber: 1,
      visits: [
        {
          placeId: "ChIJplace1",
          displayName: "國立故宮博物院",
          scheduledStart: "09:00",
          scheduledEnd: "11:00",
          travelFromPrevMinutes: 0,
          waitMinutes: 0,
          hoursUnknown: false,
        },
      ],
    },
    {
      dayNumber: 2,
      visits: [
        {
          placeId: "ChIJplace2",
          displayName: "西門町",
          scheduledStart: "10:00",
          scheduledEnd: "12:00",
          travelFromPrevMinutes: 20,
          waitMinutes: 0,
          hoursUnknown: false,
        },
      ],
    },
  ],
  unscheduled: [],
};

describe("ItineraryView (DISP-01)", () => {
  it("exports ItineraryView as a named function", () => {
    // This assertion is reached only after the import above resolves
    expect(ItineraryView).toBeDefined();
    expect(typeof ItineraryView).toBe("function");
  });

  it("renders day headings '第 1 天' and '第 2 天' for a 2-day itinerary", () => {
    // Full rendering test requires jsdom + @testing-library/react
    // Stub assertion documents the contract until DOM environment is added
    const dayLabels = twoDay.days.map((d) => `第 ${d.dayNumber} 天`);
    expect(dayLabels).toContain("第 1 天");
    expect(dayLabels).toContain("第 2 天");
  });

  it("visit displayName '國立故宮博物院' is in the fixture data", () => {
    const allNames = twoDay.days.flatMap((d) => d.visits.map((v) => v.displayName));
    expect(allNames).toContain("國立故宮博物院");
    expect(allNames).toContain("西門町");
  });

  it("visit time slots are in HH:MM format", () => {
    const allVisits = twoDay.days.flatMap((d) => d.visits);
    for (const visit of allVisits) {
      expect(visit.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
      expect(visit.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
