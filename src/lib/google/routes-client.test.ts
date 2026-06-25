/**
 * Unit tests for computeRouteMatrix — Google Routes API client.
 *
 * All tests mock global `fetch` via vi.stubGlobal — no real network calls.
 * Tests assert:
 *  - Correct request target (routes.googleapis.com) and headers
 *  - Correct origins/destinations length for N coords
 *  - Correct minute conversion (seconds / 60, rounded) + diagonal = 0
 *  - Sentinel (Number.MAX_SAFE_INTEGER) for ROUTE_NOT_FOUND / missing pairs
 *  - Non-OK HTTP throws an Error containing the status code
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeRouteMatrix,
  ROUTES_MATRIX_FIELD_MASK,
  type RouteMatrixCoord,
} from "./routes-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal element that the Routes API returns for a reachable pair. */
function makeElement(
  originIndex: number,
  destinationIndex: number,
  durationSeconds: number
): object {
  return {
    originIndex,
    destinationIndex,
    condition: "ROUTE_EXISTS",
    duration: `${durationSeconds}s`,
  };
}

/** Build a mock fetch that returns the given JSON body. */
function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

// ---------------------------------------------------------------------------
// Test coordinates
// ---------------------------------------------------------------------------

const COORDS_2: RouteMatrixCoord[] = [
  { lat: 25.0478, lng: 121.5171 },
  { lat: 25.0330, lng: 121.5654 },
];

const COORDS_3: RouteMatrixCoord[] = [
  { lat: 25.0478, lng: 121.5171 },
  { lat: 25.0330, lng: 121.5654 },
  { lat: 25.0422, lng: 121.5632 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeRouteMatrix", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Request shape tests
  // -------------------------------------------------------------------------

  it("sends POST to routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", async () => {
    // Minimal 2×2 response
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      makeElement(1, 0, 720),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    await computeRouteMatrix(COORDS_2, "test-key");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("routes.googleapis.com");
    expect(url).toContain("distanceMatrix/v2:computeRouteMatrix");
  });

  it("includes X-Goog-FieldMask header equal to ROUTES_MATRIX_FIELD_MASK", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 300),
      makeElement(1, 0, 300),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    await computeRouteMatrix(COORDS_2, "my-api-key");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toBe(ROUTES_MATRIX_FIELD_MASK);
  });

  it("includes X-Goog-Api-Key header with the passed apiKey", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 300),
      makeElement(1, 0, 300),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    await computeRouteMatrix(COORDS_2, "my-secret-key");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("my-secret-key");
  });

  it("sends origins and destinations each with length N for N coords", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 300),
      makeElement(0, 2, 600),
      makeElement(1, 0, 300),
      makeElement(1, 1, 0),
      makeElement(1, 2, 400),
      makeElement(2, 0, 600),
      makeElement(2, 1, 400),
      makeElement(2, 2, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    await computeRouteMatrix(COORDS_3, "test-key");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      origins: unknown[];
      destinations: unknown[];
    };
    expect(body.origins).toHaveLength(3);
    expect(body.destinations).toHaveLength(3);
  });

  it("uses DRIVE travelMode in the request body", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 300),
      makeElement(1, 0, 300),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    await computeRouteMatrix(COORDS_2, "test-key");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { travelMode: string };
    expect(body.travelMode).toBe("DRIVE");
  });

  // -------------------------------------------------------------------------
  // Response parsing tests
  // -------------------------------------------------------------------------

  it("returns an N×N matrix for N=2 coords", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      makeElement(1, 0, 720),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
    expect(matrix[1]).toHaveLength(2);
  });

  it("sets diagonal entries to 0", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      makeElement(1, 0, 720),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix[0][0]).toBe(0);
    expect(matrix[1][1]).toBe(0);
  });

  it("converts duration seconds to minutes (rounded)", async () => {
    // 600s → 10 min, 720s → 12 min, 90s → 2 min (rounded from 1.5)
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),   // 10 min
      makeElement(1, 0, 90),    // 1.5 min → rounds to 2
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix[0][1]).toBe(10);
    expect(matrix[1][0]).toBe(2); // Math.round(90/60) = Math.round(1.5) = 2
  });

  it("parses 3×3 matrix correctly with all ROUTE_EXISTS pairs", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      makeElement(0, 2, 1200),
      makeElement(1, 0, 720),
      makeElement(1, 1, 0),
      makeElement(1, 2, 480),
      makeElement(2, 0, 1260),
      makeElement(2, 1, 420),
      makeElement(2, 2, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_3, "test-key");

    expect(matrix[0][1]).toBe(10);  // 600s = 10 min
    expect(matrix[0][2]).toBe(20);  // 1200s = 20 min
    expect(matrix[1][0]).toBe(12);  // 720s = 12 min
    expect(matrix[1][2]).toBe(8);   // 480s = 8 min
    expect(matrix[2][0]).toBe(21);  // 1260s = 21 min
    expect(matrix[2][1]).toBe(7);   // 420s = 7 min
  });

  // -------------------------------------------------------------------------
  // Sentinel for unreachable pairs
  // -------------------------------------------------------------------------

  it("uses Number.MAX_SAFE_INTEGER sentinel for a pair not in response (missing element)", async () => {
    // Only provide 0→1; missing 1→0 entirely from response
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      // 1→0 is missing
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix[1][0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("uses Number.MAX_SAFE_INTEGER sentinel for a ROUTE_NOT_FOUND condition", async () => {
    const elements = [
      makeElement(0, 0, 0),
      makeElement(0, 1, 600),
      // ROUTE_NOT_FOUND — not ROUTE_EXISTS
      {
        originIndex: 1,
        destinationIndex: 0,
        condition: "ROUTE_NOT_FOUND",
        duration: "0s",
      },
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix[1][0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("unreachable pair sentinel is never 0 (never treated as free travel)", async () => {
    // Provide only diagonal elements — all off-diagonal are missing
    const elements = [
      makeElement(0, 0, 0),
      makeElement(1, 1, 0),
    ];
    const fetchMock = mockFetch(elements);
    vi.stubGlobal("fetch", fetchMock);

    const matrix = await computeRouteMatrix(COORDS_2, "test-key");

    expect(matrix[0][1]).toBe(Number.MAX_SAFE_INTEGER);
    expect(matrix[1][0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("throws an Error containing the HTTP status on non-OK response", async () => {
    const fetchMock = mockFetch({ error: "PERMISSION_DENIED" }, 403);
    vi.stubGlobal("fetch", fetchMock);

    await expect(computeRouteMatrix(COORDS_2, "bad-key")).rejects.toThrow("403");
  });

  it("throws an Error on 500 response", async () => {
    const fetchMock = mockFetch({ error: "Internal Server Error" }, 500);
    vi.stubGlobal("fetch", fetchMock);

    await expect(computeRouteMatrix(COORDS_2, "test-key")).rejects.toThrow("500");
  });

  it("ROUTES_MATRIX_FIELD_MASK includes originIndex, destinationIndex, duration, condition", () => {
    expect(ROUTES_MATRIX_FIELD_MASK).toContain("originIndex");
    expect(ROUTES_MATRIX_FIELD_MASK).toContain("destinationIndex");
    expect(ROUTES_MATRIX_FIELD_MASK).toContain("duration");
    expect(ROUTES_MATRIX_FIELD_MASK).toContain("condition");
  });
});
