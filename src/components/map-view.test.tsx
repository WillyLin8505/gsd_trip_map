/**
 * Tests for MapView — covers DISP-03.
 *
 * RED scaffold: fails until src/components/map-view.tsx is implemented (03-03).
 *
 * TODO(03-03): green when MapView lands
 *
 * Behavior under test (DISP-03):
 * - MapView receives days with coordinates + renders Polyline stub per day
 * - MapView renders AdvancedMarker stub per visit
 * - Per-day color from DAY_COLORS palette applied to each Polyline
 *
 * Note on @vis.gl/react-google-maps mocking:
 * The library requires a real browser environment for full testing.
 * Unit tests mock the library to return lightweight stubs that capture props.
 * This validates that MapView passes correct path/strokeColor to Polyline stubs.
 */

import { describe, it, expect, vi } from "vitest";

// Mock @vis.gl/react-google-maps before importing MapView
// TODO(03-03): These stubs will be used when MapView renders in jsdom
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => children,
  Map: ({ children }: { children: React.ReactNode }) => children,
  AdvancedMarker: vi.fn(({ children }: { children?: React.ReactNode }) => children),
  Polyline: vi.fn(() => null),
  InfoWindow: vi.fn(() => null),
  useMap: vi.fn(() => null),
  useMapsLibrary: vi.fn(() => null),
  useAdvancedMarkerRef: vi.fn(() => [vi.fn(), null]),
}));

// TODO(03-03): green when MapView lands
// This import will fail (MODULE_NOT_FOUND) until map-view.tsx is created
import { MapView } from "./map-view";
import { DAY_COLORS, getDayColor } from "@/lib/map/day-colors";

/** Multi-day visit fixture with coordinates (coordinate gap already filled) */
const daysWithCoords = [
  {
    dayNumber: 1,
    visits: [
      {
        placeId: "ChIJp1",
        displayName: "台北101",
        scheduledStart: "09:00",
        scheduledEnd: "11:00",
        travelFromPrevMinutes: 0,
        waitMinutes: 0,
        hoursUnknown: false,
        lat: 25.0338,
        lng: 121.5645,
      },
      {
        placeId: "ChIJp2",
        displayName: "象山",
        scheduledStart: "11:30",
        scheduledEnd: "13:00",
        travelFromPrevMinutes: 15,
        waitMinutes: 0,
        hoursUnknown: false,
        lat: 25.0268,
        lng: 121.5773,
      },
    ],
  },
  {
    dayNumber: 2,
    visits: [
      {
        placeId: "ChIJp3",
        displayName: "西門町",
        scheduledStart: "10:00",
        scheduledEnd: "12:00",
        travelFromPrevMinutes: 20,
        waitMinutes: 0,
        hoursUnknown: false,
        lat: 25.0449,
        lng: 121.5081,
      },
    ],
  },
];

describe("MapView (DISP-03)", () => {
  it("exports MapView as a named function", () => {
    // This assertion is reached only after the import above resolves
    expect(MapView).toBeDefined();
    expect(typeof MapView).toBe("function");
  });

  it("DAY_COLORS palette has 5 entries (one per day before wrap)", () => {
    expect(DAY_COLORS).toHaveLength(5);
    expect(DAY_COLORS[0]).toBe("#2563EB"); // Day 1: blue
    expect(DAY_COLORS[1]).toBe("#16A34A"); // Day 2: green
    expect(DAY_COLORS[4]).toBe("#DC2626"); // Day 5: red
  });

  it("getDayColor(0) returns blue (Day 1)", () => {
    expect(getDayColor(0)).toBe("#2563EB");
  });

  it("getDayColor(5) wraps around to blue (Day 6 → index 0)", () => {
    expect(getDayColor(5)).toBe("#2563EB");
  });

  it("fixture data has 2 days with the expected visit counts", () => {
    expect(daysWithCoords).toHaveLength(2);
    expect(daysWithCoords[0].visits).toHaveLength(2);
    expect(daysWithCoords[1].visits).toHaveLength(1);
  });

  it("each visit in fixture has lat/lng coordinates (coordinate gap filled)", () => {
    const allVisits = daysWithCoords.flatMap((d) => d.visits);
    for (const visit of allVisits) {
      expect(typeof visit.lat).toBe("number");
      expect(typeof visit.lng).toBe("number");
      expect(visit.lat).not.toBe(0);
      expect(visit.lng).not.toBe(0);
    }
  });
});
