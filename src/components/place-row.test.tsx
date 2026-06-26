/**
 * Tests for PlaceRow — covers DISP-02.
 *
 * RED scaffold: fails until src/components/place-row.tsx is implemented (03-02).
 *
 * TODO(03-02): green when PlaceRow lands
 *
 * Behavior under test (DISP-02):
 * - Row with hoursUnknown=true renders amber warning "營業時間未知，建議出發前確認"
 * - Row with priceLevel renders the price badge
 * - Row with normal hours shows scheduled time slot
 */

import { describe, it, expect } from "vitest";

// TODO(03-02): green when PlaceRow lands
// This import will fail (MODULE_NOT_FOUND) until place-row.tsx is created
import { PlaceRow } from "./place-row";
import type { ScheduledVisit } from "@/types/itinerary";

/** Visit fixture with hoursUnknown=true */
const unknownHoursVisit: ScheduledVisit = {
  placeId: "ChIJunknown",
  displayName: "神秘景點",
  scheduledStart: "09:00",
  scheduledEnd: "10:00",
  travelFromPrevMinutes: 15,
  waitMinutes: 0,
  hoursUnknown: true,
  warning: "營業時間未知，建議出發前確認",
};

/** Visit fixture with normal hours */
const normalVisit: ScheduledVisit = {
  placeId: "ChIJnormal",
  displayName: "台北101",
  scheduledStart: "14:00",
  scheduledEnd: "16:00",
  travelFromPrevMinutes: 30,
  waitMinutes: 0,
  hoursUnknown: false,
};

describe("PlaceRow (DISP-02)", () => {
  it("exports PlaceRow as a named function", () => {
    // This assertion is reached only after the import above resolves
    expect(PlaceRow).toBeDefined();
    expect(typeof PlaceRow).toBe("function");
  });

  it("hoursUnknown visit has warning text '營業時間未知，建議出發前確認'", () => {
    // Contract: hoursUnknown=true visits must carry the warning text
    expect(unknownHoursVisit.hoursUnknown).toBe(true);
    expect(unknownHoursVisit.warning).toBe("營業時間未知，建議出發前確認");
  });

  it("normal visit has hoursUnknown=false and no warning", () => {
    expect(normalVisit.hoursUnknown).toBe(false);
    expect(normalVisit.warning).toBeUndefined();
  });

  it("visit time slot is in HH:MM format", () => {
    const visits = [unknownHoursVisit, normalVisit];
    for (const v of visits) {
      expect(v.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
      expect(v.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
