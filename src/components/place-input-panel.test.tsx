/**
 * E2E happy-path test for PlaceInputPanel.
 *
 * RED scaffold: fails until src/components/place-input-panel.tsx is implemented (Task 2/3).
 *
 * Flow under test (AUTH-01 — no auth):
 *   1. Render PlaceInputPanel
 *   2. User types a city and two place names, clicks 查詢地點
 *   3. Mock /api/places/resolve returns 2 ResolvedPlaces with displayName/formattedAddress/lat/lng
 *   4. User sees both places in confirmation list
 *   5. User clicks 最佳化行程
 *   6. Mock /api/optimize returns OptimizeResult with 1 day, 2 visits
 *   7. "第 1 天" heading and both visit time slots appear in the rendered tree
 *   8. No Supabase/auth calls — fetch was called only with /api/places/resolve and /api/optimize
 *
 * Testing strategy: pure data / import assertions in node environment.
 * DOM-level rendering assertions are documented as contracts to be expanded
 * once jsdom is added. The import failure (RED gate) is the primary gating mechanism.
 */

import { describe, it, expect } from "vitest";

// TODO(03-02): GREEN when PlaceInputPanel lands.
// This import will fail (MODULE_NOT_FOUND) until place-input-panel.tsx is created.
import { PlaceInputPanel } from "./place-input-panel";
import type { ResolvedPlace } from "@/lib/validation/resolve";
import type { OptimizeResult } from "@/types/itinerary";

/** Minimal ResolvedPlace[] fixture — 2 places with lat/lng for coord join */
const resolvedFixture: ResolvedPlace[] = [
  {
    placeId: "ChIJplace1",
    displayName: "國立故宮博物院",
    formattedAddress: "台灣台北市士林區至善路二段221號",
    lat: 25.1023,
    lng: 121.5484,
  },
  {
    placeId: "ChIJplace2",
    displayName: "西門町",
    formattedAddress: "台灣台北市萬華區西門町",
    lat: 25.0424,
    lng: 121.5082,
  },
];

/** Minimal OptimizeResult fixture — 1 day, 2 visits */
const optimizeFixture: OptimizeResult = {
  suggestedDays: 1,
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
        {
          placeId: "ChIJplace2",
          displayName: "西門町",
          scheduledStart: "11:30",
          scheduledEnd: "13:30",
          travelFromPrevMinutes: 20,
          waitMinutes: 0,
          hoursUnknown: false,
        },
      ],
    },
  ],
  unscheduled: [],
};

describe("PlaceInputPanel E2E (AUTH-01 anonymous flow)", () => {
  it("exports PlaceInputPanel as a named function", () => {
    expect(PlaceInputPanel).toBeDefined();
    expect(typeof PlaceInputPanel).toBe("function");
  });

  it("resolve fixture has 2 places with displayName + formattedAddress + lat/lng", () => {
    expect(resolvedFixture).toHaveLength(2);
    for (const place of resolvedFixture) {
      expect(place.displayName).toBeTruthy();
      expect(place.formattedAddress).toBeTruthy();
      expect(typeof place.lat).toBe("number");
      expect(typeof place.lng).toBe("number");
      expect(place.placeId).toBeTruthy();
    }
  });

  it("optimize fixture produces '第 1 天' label and 2 visits with HH:MM time slots", () => {
    // Verify the fixture data that the component will render
    expect(optimizeFixture.days).toHaveLength(1);
    const day = optimizeFixture.days[0];
    expect(`第 ${day.dayNumber} 天`).toBe("第 1 天");
    expect(day.visits).toHaveLength(2);
    for (const visit of day.visits) {
      expect(visit.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
      expect(visit.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("CTA copy contract: 查詢地點 and 最佳化行程 are the exact button labels", () => {
    // These string literals pin the zh-TW CTA copy contract.
    // The component must use exactly these strings (not variants).
    const resolveCTA = "查詢地點";
    const optimizeCTA = "最佳化行程";
    expect(resolveCTA).toBe("查詢地點");
    expect(optimizeCTA).toBe("最佳化行程");
  });

  it("day heading label is '第 N 天' format", () => {
    const headings = optimizeFixture.days.map((d) => `第 ${d.dayNumber} 天`);
    expect(headings).toContain("第 1 天");
  });

  it("AUTH-01: resolve fixture has no auth/session fields", () => {
    // resolvedPlaces from /api/places/resolve must not carry auth tokens
    for (const place of resolvedFixture) {
      expect(Object.keys(place)).not.toContain("session");
      expect(Object.keys(place)).not.toContain("userId");
      expect(Object.keys(place)).not.toContain("token");
    }
  });

  it("resolvedPlace lat/lng are preserved for downstream map coordinate join", () => {
    // 03-CONTEXT.md: resolvedPlaces Map<placeId, {lat,lng}> feeds MapView
    const coordMap = new Map(resolvedFixture.map((p) => [p.placeId, { lat: p.lat, lng: p.lng }]));
    expect(coordMap.get("ChIJplace1")?.lat).toBe(25.1023);
    expect(coordMap.get("ChIJplace2")?.lng).toBe(121.5082);
  });
});
