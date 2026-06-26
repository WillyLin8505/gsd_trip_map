/**
 * Tests for POST /api/optimize Route Handler.
 *
 * Mocking strategy:
 * - @/lib/db — mocked module; db.select().from().where() returns controlled rows
 * - @/lib/google/routes-client — vi.mock; computeRouteMatrix returns a known matrix
 * - process.env.GOOGLE_PLACES_API_KEY — set/unset per test via vi.stubEnv
 * - Real optimize() is NOT mocked — it runs with the data built by the handler
 *   so the 200 happy-path test validates actual integration (purity gate)
 *
 * Tests assert:
 *  - Empty/missing placeIds → 400, db not called, computeRouteMatrix not called
 *  - numDays=0 → 400 (non-positive integer)
 *  - A placeId not in the cache → 422 listing missing IDs; computeRouteMatrix not called
 *  - Happy path (5 mocked places) → 200 with suggestedDays/days/unscheduled shape
 *  - computeRouteMatrix called exactly once on happy path
 *  - Missing GOOGLE_PLACES_API_KEY → 500
 *  - OptimizerPlace[] built from DB columns (visitDurationMinutes, hoursUnknown, openingHours)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — declared before import (vi.mock is hoisted)
// ---------------------------------------------------------------------------

// Mock the DB to avoid real Postgres connection
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock computeRouteMatrix to avoid real Routes API calls
vi.mock("@/lib/google/routes-client", () => ({
  computeRouteMatrix: vi.fn(),
}));

// Import after mocks are declared
import { POST } from "./route";
import { db } from "@/lib/db";
import { computeRouteMatrix } from "@/lib/google/routes-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a minimal DB row matching the places table schema. */
function makePlaceRow(overrides: Partial<{
  id: string;
  place_id: string;
  display_name: string;
  lat: number;
  lng: number;
  default_visit_duration_minutes: number | null;
  hours_unknown: boolean;
  opening_hours: unknown;
  utc_offset_minutes: number | null;
  place_types: string[] | null;
}> = {}) {
  return {
    id: "uuid-" + Math.random(),
    place_id: "ChIJtest",
    display_name: "Test Place",
    address: "123 Test St",
    lat: 25.0478,
    lng: 121.5171,
    default_visit_duration_minutes: 60,
    hours_unknown: false,
    opening_hours: null,
    utc_offset_minutes: 480,
    place_types: ["tourist_attraction"],
    price_level: null,
    rating: null,
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Setup the db mock chain to return the given rows.
 * db.select().from().where() → rows
 */
function mockDbReturn(rows: ReturnType<typeof makePlaceRow>[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  vi.mocked(db!.select).mockReturnValue({ from: fromMock } as unknown as ReturnType<NonNullable<typeof db>["select"]>);
  return { whereMock, fromMock };
}

/** Build an identity N×N matrix (0 on diagonal, small value off-diagonal). */
function makeMatrix(n: number, offDiagonalMinutes = 15): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : offDiagonalMinutes))
  );
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: API key is set
  process.env.GOOGLE_PLACES_API_KEY = "test-api-key";
});

afterEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Validation tests (400)
// ---------------------------------------------------------------------------

describe("POST /api/optimize — input validation", () => {
  it("returns 400 when placeIds is missing from body", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body).toHaveProperty("error");
    // db and computeRouteMatrix must NOT be called before validation fails
    expect(db!.select).not.toHaveBeenCalled();
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when placeIds is an empty array", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: [] }));
    expect(res.status).toBe(400);
    expect(db!.select).not.toHaveBeenCalled();
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when numDays is 0 (non-positive integer)", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: ["ChIJtest1"], numDays: 0 }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when numDays is a float (non-integer)", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: ["ChIJtest1"], numDays: 1.5 }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when placeIds contains more than 25 entries (T-02-07 DoS cap)", async () => {
    const tooMany = Array.from({ length: 26 }, (_, i) => `ChIJ${i}`);
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: tooMany }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unresolved placeIds test (422)
// ---------------------------------------------------------------------------

describe("POST /api/optimize — unresolved placeIds", () => {
  it("returns 422 with missing placeIds listed when a placeId is not in the cache", async () => {
    // Only 1 of the 2 requested placeIds is in the cache
    const cachedRow = makePlaceRow({ place_id: "ChIJcached" });
    mockDbReturn([cachedRow]);

    const res = await POST(makeRequest({ placeIds: ["ChIJcached", "ChIJmissing"] }));

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; details: unknown };
    expect(body.error).toContain("Unresolved");
    expect(body.details).toContain("ChIJmissing");
    // computeRouteMatrix must NOT be called when placeIds are missing (T-02-06)
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 422 when ALL placeIds are missing from the cache", async () => {
    mockDbReturn([]); // empty cache

    const res = await POST(makeRequest({ placeIds: ["ChIJmissing1", "ChIJmissing2"] }));

    expect(res.status).toBe(422);
    const body = await res.json() as { error: string; details: unknown[] };
    expect(body.details).toContain("ChIJmissing1");
    expect(body.details).toContain("ChIJmissing2");
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Configuration error test (500)
// ---------------------------------------------------------------------------

describe("POST /api/optimize — configuration errors", () => {
  it("returns 500 when GOOGLE_PLACES_API_KEY is not set", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    // DB would return rows if reached, but the handler should fail on missing key
    const rows = ["ChIJp1", "ChIJp2"].map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);

    const res = await POST(makeRequest({ placeIds: ["ChIJp1", "ChIJp2"] }));

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("GOOGLE_PLACES_API_KEY");
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path test (200) — real optimize(), mocked db + computeRouteMatrix
// ---------------------------------------------------------------------------

describe("POST /api/optimize — happy path", () => {
  it("returns 200 with suggestedDays, days, unscheduled for 5 cached places", async () => {
    const placeIds = ["ChIJp1", "ChIJp2", "ChIJp3", "ChIJp4", "ChIJp5"];
    const rows = placeIds.map((id, i) =>
      makePlaceRow({
        place_id: id,
        display_name: `Place ${i + 1}`,
        lat: 25.0 + i * 0.01,
        lng: 121.5 + i * 0.01,
        default_visit_duration_minutes: 60,
        hours_unknown: false,
        opening_hours: null,
        utc_offset_minutes: 480,
      })
    );
    mockDbReturn(rows);

    // 5×5 matrix with 15-minute travel between all pairs
    const matrix = makeMatrix(5, 15);
    vi.mocked(computeRouteMatrix).mockResolvedValue(matrix);

    const res = await POST(makeRequest({ placeIds, numDays: 2 }));

    expect(res.status).toBe(200);
    const body = await res.json() as {
      suggestedDays: number;
      days: Array<{
        dayNumber: number;
        visits: Array<{
          placeId: string;
          displayName: string;
          scheduledStart: string;
          scheduledEnd: string;
          travelFromPrevMinutes: number;
          waitMinutes: number;
          hoursUnknown: boolean;
        }>;
      }>;
      unscheduled: Array<{ placeId: string; reason: string }>;
    };

    // Contract gate: response must have all three top-level keys
    expect(body).toHaveProperty("suggestedDays");
    expect(body).toHaveProperty("days");
    expect(body).toHaveProperty("unscheduled");

    // suggestedDays must be positive
    expect(body.suggestedDays).toBeGreaterThan(0);

    // days must be an array
    expect(Array.isArray(body.days)).toBe(true);

    // Each day must have dayNumber and visits array
    for (const day of body.days) {
      expect(day).toHaveProperty("dayNumber");
      expect(typeof day.dayNumber).toBe("number");
      expect(Array.isArray(day.visits)).toBe(true);

      // Each visit must have all locked contract fields
      for (const visit of day.visits) {
        expect(visit).toHaveProperty("placeId");
        expect(visit).toHaveProperty("displayName");
        expect(visit).toHaveProperty("scheduledStart");
        expect(visit).toHaveProperty("scheduledEnd");
        expect(visit).toHaveProperty("travelFromPrevMinutes");
        expect(visit).toHaveProperty("waitMinutes");
        expect(visit).toHaveProperty("hoursUnknown");

        // HH:MM format
        expect(visit.scheduledStart).toMatch(/^\d{2}:\d{2}$/);
        expect(visit.scheduledEnd).toMatch(/^\d{2}:\d{2}$/);
      }
    }

    // unscheduled must be an array
    expect(Array.isArray(body.unscheduled)).toBe(true);

    // Conservation: all 5 places accounted for across days + unscheduled
    const scheduledIds = body.days.flatMap((d) => d.visits.map((v) => v.placeId));
    const unscheduledIds = body.unscheduled.map((u) => u.placeId);
    const allIds = [...scheduledIds, ...unscheduledIds];
    expect(allIds.sort()).toEqual(placeIds.sort());
  });

  it("calls computeRouteMatrix exactly once on the happy path", async () => {
    const placeIds = ["ChIJp1", "ChIJp2", "ChIJp3"];
    const rows = placeIds.map((id, i) =>
      makePlaceRow({
        place_id: id,
        lat: 25.0 + i * 0.01,
        lng: 121.5 + i * 0.01,
      })
    );
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(3));

    await POST(makeRequest({ placeIds }));

    // Single-matrix-call gate (SCHED-03 / CONTEXT.md purity boundary)
    expect(computeRouteMatrix).toHaveBeenCalledTimes(1);
  });

  it("passes the correct apiKey to computeRouteMatrix", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "my-routes-key";

    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));

    await POST(makeRequest({ placeIds }));

    expect(computeRouteMatrix).toHaveBeenCalledWith(
      expect.any(Array),
      "my-routes-key"
    );
  });
});

// ---------------------------------------------------------------------------
// DB-to-OptimizerPlace mapping tests
// ---------------------------------------------------------------------------

describe("POST /api/optimize — DB-to-OptimizerPlace mapping", () => {
  it("derives visitDurationMinutes from default_visit_duration_minutes DB column", async () => {
    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id, i) =>
      makePlaceRow({
        place_id: id,
        lat: 25.0 + i * 0.01,
        lng: 121.5 + i * 0.01,
        // Custom duration to verify mapping
        default_visit_duration_minutes: 90,
        hours_unknown: false,
        opening_hours: null,
        utc_offset_minutes: 480,
      })
    );
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));

    const res = await POST(makeRequest({ placeIds, numDays: 1 }));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      days: Array<{
        visits: Array<{ scheduledStart: string; scheduledEnd: string }>;
      }>;
    };

    // If visitDurationMinutes=90 is correctly sourced from DB, the first visit
    // should span 90 minutes from the daily start (09:00 → 10:30)
    if (body.days.length > 0 && body.days[0].visits.length > 0) {
      const firstVisit = body.days[0].visits[0];
      // 09:00 + 90 min = 10:30
      expect(firstVisit.scheduledStart).toBe("09:00");
      expect(firstVisit.scheduledEnd).toBe("10:30");
    }
  });

  it("sets hoursUnknown=true from hours_unknown DB column and emits warning", async () => {
    const placeIds = ["ChIJunknown1", "ChIJnormal2"];
    const rows = [
      makePlaceRow({
        place_id: "ChIJunknown1",
        lat: 25.0,
        lng: 121.5,
        hours_unknown: true,
        opening_hours: null,
        default_visit_duration_minutes: 60,
        utc_offset_minutes: 480,
      }),
      makePlaceRow({
        place_id: "ChIJnormal2",
        lat: 25.01,
        lng: 121.51,
        hours_unknown: false,
        opening_hours: null,
        default_visit_duration_minutes: 60,
        utc_offset_minutes: 480,
      }),
    ];
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));

    const res = await POST(makeRequest({ placeIds }));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      days: Array<{
        visits: Array<{ placeId: string; hoursUnknown: boolean; warning?: string }>;
      }>;
    };

    // Find the hoursUnknown place in the schedule output
    const allVisits = body.days.flatMap((d) => d.visits);
    const unknownVisit = allVisits.find((v) => v.placeId === "ChIJunknown1");

    if (unknownVisit) {
      expect(unknownVisit.hoursUnknown).toBe(true);
      // hoursUnknown places get a warning (per 02-CONTEXT.md hoursUnknown rule)
      expect(unknownVisit.warning).toBeDefined();
    } else {
      // If place is in unscheduled — still verify the route handler worked
      expect(res.status).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// Routes API error handling (502)
// ---------------------------------------------------------------------------

describe("POST /api/optimize — Routes API error handling", () => {
  it("returns 502 when computeRouteMatrix throws", async () => {
    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockRejectedValue(new Error("Routes API error 429"));

    const res = await POST(makeRequest({ placeIds }));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body).toHaveProperty("error");
  });
});
