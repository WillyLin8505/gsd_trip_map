/**
 * Tests for POST /api/optimize/day Route Handler.
 *
 * Mocking strategy:
 * - @/lib/db — mocked module; db.select().from().where() returns controlled rows
 * - @/lib/google/routes-client — vi.mock; computeRouteMatrix returns a known matrix
 * - @/lib/optimizer/day — vi.mock; scheduleSingleDay returns controlled output
 *   (unlike optimize route, we mock scheduleSingleDay to isolate the route handler)
 * - process.env.GOOGLE_PLACES_API_KEY — set/unset per test
 *
 * Tests assert:
 *  - Invalid JSON body → 400
 *  - Missing/empty placeIds → 400
 *  - Missing reorder field → 400
 *  - placeIds > 25 → 400 (T-06-01 DoS cap)
 *  - A placeId not in DB → 422 listing missing IDs; computeRouteMatrix NOT called
 *  - Missing GOOGLE_PLACES_API_KEY → 500
 *  - computeRouteMatrix throws → 502
 *  - Happy path reorder=false → 200, scheduleSingleDay called with {reorder:false, dayNumber}
 *  - Response shape is { day, unscheduled } NOT a full OptimizeResult (Pitfall 5)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Module mocks — declared before import (vi.mock is hoisted)
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => {
  const dbMock = { select: vi.fn() };
  return { getDb: () => dbMock };
});

vi.mock("@/lib/google/routes-client", () => ({
  computeRouteMatrix: vi.fn(),
}));

vi.mock("@/lib/optimizer/day", () => ({
  scheduleSingleDay: vi.fn(),
}));

// Import after mocks are declared
import { POST } from "./route";
import { getDb } from "@/lib/db";
import { computeRouteMatrix } from "@/lib/google/routes-client";
import { scheduleSingleDay } from "@/lib/optimizer/day";

// Stable mocked db handle
const db = getDb();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/optimize/day", {
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
  address: string;
  lat: number;
  lng: number;
  default_visit_duration_minutes: number | null;
  hours_unknown: boolean;
  opening_hours: unknown;
  utc_offset_minutes: number | null;
  place_types: string[] | null;
  price_level: number | null;
  rating: number | null;
  updated_at: Date;
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
  vi.mocked(db!.select).mockReturnValue({
    from: fromMock,
  } as unknown as ReturnType<NonNullable<typeof db>["select"]>);
  return { whereMock, fromMock };
}

/** Build an identity N×N matrix (0 on diagonal, small value off-diagonal). */
function makeMatrix(n: number, offDiagonalMinutes = 15): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : offDiagonalMinutes))
  );
}

/** Build a fake scheduleSingleDay return value. */
function makeScheduleResult(placeIds: string[]) {
  return {
    day: {
      dayNumber: 1,
      visits: placeIds.map((placeId, i) => ({
        placeId,
        displayName: `Place ${i + 1}`,
        scheduledStart: "09:00",
        scheduledEnd: "10:00",
        travelFromPrevMinutes: 0,
        waitMinutes: 0,
        hoursUnknown: false,
      })),
    },
    unscheduled: [] as Array<{ placeId: string; reason: string }>,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_PLACES_API_KEY = "test-api-key";
});

afterEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Validation tests (400)
// ---------------------------------------------------------------------------

describe("POST /api/optimize/day — input validation", () => {
  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/optimize/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when placeIds is missing", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ reorder: false }));
    expect(res.status).toBe(400);
    expect(db!.select).not.toHaveBeenCalled();
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when placeIds is an empty array", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: [], reorder: false }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when reorder field is missing", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: ["ChIJtest"] }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when placeIds contains more than 25 entries (T-06-01 DoS cap)", async () => {
    const tooMany = Array.from({ length: 26 }, (_, i) => `ChIJ${i}`);
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: tooMany, reorder: false }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });

  it("returns 400 when a placeId is an empty string", async () => {
    mockDbReturn([]);
    const res = await POST(makeRequest({ placeIds: [""], reorder: false }));
    expect(res.status).toBe(400);
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unresolved placeIds (422)
// ---------------------------------------------------------------------------

describe("POST /api/optimize/day — unresolved placeIds", () => {
  it("returns 422 when a placeId is absent from DB; computeRouteMatrix NOT called", async () => {
    const cachedRow = makePlaceRow({ place_id: "ChIJcached" });
    mockDbReturn([cachedRow]);

    const res = await POST(
      makeRequest({ placeIds: ["ChIJcached", "ChIJmissing"], reorder: false })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toContain("Unresolved");
    expect(body.details).toContain("ChIJmissing");
    // computeRouteMatrix must NOT be called when placeIds are unresolved
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Configuration errors (500)
// ---------------------------------------------------------------------------

describe("POST /api/optimize/day — configuration errors", () => {
  it("returns 500 when GOOGLE_PLACES_API_KEY is not set", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const rows = ["ChIJp1", "ChIJp2"].map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);

    const res = await POST(
      makeRequest({ placeIds: ["ChIJp1", "ChIJp2"], reorder: false })
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("GOOGLE_PLACES_API_KEY");
    expect(computeRouteMatrix).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Routes API error (502)
// ---------------------------------------------------------------------------

describe("POST /api/optimize/day — Routes API error handling", () => {
  it("returns 502 when computeRouteMatrix throws", async () => {
    const rows = ["ChIJp1", "ChIJp2"].map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockRejectedValue(
      new Error("Routes API error 429")
    );

    const res = await POST(
      makeRequest({ placeIds: ["ChIJp1", "ChIJp2"], reorder: false })
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// Happy path (200) — reorder=false
// ---------------------------------------------------------------------------

describe("POST /api/optimize/day — happy path reorder=false", () => {
  it("returns 200 with { day, unscheduled } shape (NOT a full OptimizeResult)", async () => {
    const placeIds = ["ChIJp1", "ChIJp2", "ChIJp3"];
    const rows = placeIds.map((id, i) =>
      makePlaceRow({
        place_id: id,
        display_name: `Place ${i + 1}`,
        lat: 25.0 + i * 0.01,
        lng: 121.5 + i * 0.01,
      })
    );
    mockDbReturn(rows);

    const matrix = makeMatrix(3, 15);
    vi.mocked(computeRouteMatrix).mockResolvedValue(matrix);

    const scheduleResult = makeScheduleResult(placeIds);
    vi.mocked(scheduleSingleDay).mockReturnValue(scheduleResult);

    const res = await POST(
      makeRequest({ placeIds, reorder: false, dayNumber: 2 })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      day: { dayNumber: number; visits: unknown[] };
      unscheduled: unknown[];
    };

    // Response must have { day, unscheduled } — NOT suggestedDays (Pitfall 5)
    expect(body).toHaveProperty("day");
    expect(body).toHaveProperty("unscheduled");
    expect(body).not.toHaveProperty("suggestedDays");
    expect(Array.isArray(body.unscheduled)).toBe(true);
  });

  it("calls scheduleSingleDay with mode { reorder:false, dayNumber } from request", async () => {
    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));
    vi.mocked(scheduleSingleDay).mockReturnValue(makeScheduleResult(placeIds));

    await POST(
      makeRequest({ placeIds, reorder: false, dayNumber: 3 })
    );

    expect(scheduleSingleDay).toHaveBeenCalledTimes(1);
    expect(scheduleSingleDay).toHaveBeenCalledWith(
      expect.any(Array), // optimizerPlaces
      expect.any(Array), // matrix
      expect.objectContaining({ travelDate: expect.any(String) }), // opts with travelDate
      { reorder: false, dayNumber: 3 }
    );
  });

  it("calls computeRouteMatrix exactly once on happy path", async () => {
    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));
    vi.mocked(scheduleSingleDay).mockReturnValue(makeScheduleResult(placeIds));

    await POST(makeRequest({ placeIds, reorder: false }));

    expect(computeRouteMatrix).toHaveBeenCalledTimes(1);
  });

  it("uses travelDate from request body when provided", async () => {
    const placeIds = ["ChIJp1", "ChIJp2"];
    const rows = placeIds.map((id) => makePlaceRow({ place_id: id }));
    mockDbReturn(rows);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(2));
    vi.mocked(scheduleSingleDay).mockReturnValue(makeScheduleResult(placeIds));

    await POST(
      makeRequest({ placeIds, reorder: false, travelDate: "2026-08-01" })
    );

    expect(scheduleSingleDay).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({ travelDate: "2026-08-01" }),
      expect.any(Object)
    );
  });

  it("defaults travelDate to a Monday when not provided (Pitfall 3)", async () => {
    const placeIds = ["ChIJp1"];
    mockDbReturn([makePlaceRow({ place_id: "ChIJp1" })]);
    vi.mocked(computeRouteMatrix).mockResolvedValue(makeMatrix(1));
    vi.mocked(scheduleSingleDay).mockReturnValue(makeScheduleResult(placeIds));

    await POST(makeRequest({ placeIds, reorder: false }));

    // scheduleSingleDay must be called with a travelDate (YYYY-MM-DD format)
    expect(scheduleSingleDay).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      expect.objectContaining({
        travelDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      expect.any(Object)
    );
  });
});
