import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { computeRouteMatrix, type RouteMatrixCoord } from "@/lib/google/routes-client";
import { optimize } from "@/lib/optimizer";
import type { OptimizerPlace } from "@/lib/optimizer/types";
import type { OpeningHoursPeriod } from "@/lib/google/places-client";
import { durationForTypes } from "@/lib/places/duration-table";
import {
  optimizeRequestSchema,
  type OptimizeErrorResponse,
} from "@/lib/validation/optimize";

/**
 * POST /api/optimize
 *
 * End-to-end vertical slice for the optimization engine:
 *   1. Validate request body (Zod — T-02-06, T-02-07)
 *   2. Load resolved places from the shared places cache (Drizzle `inArray`)
 *   3. Reject unresolved placeIds with 422 (T-02-09: never silent drop)
 *   4. Read GOOGLE_PLACES_API_KEY from process.env (T-02-08: server-only)
 *   5. Fetch N×N travel-time matrix from Routes API — called EXACTLY ONCE
 *      before optimize() (SCHED-03 purity boundary)
 *   6. Map DB rows → OptimizerPlace[] (DB-sourced data, not re-fetched from Google)
 *   7. Run optimize() — pure function, no I/O
 *   8. Return the locked 02-CONTEXT.md response contract
 *
 * Security (threat model):
 * - T-02-06: Zod schema validates placeIds as non-empty string[]; Drizzle `inArray`
 *   parameterizes the query — never raw SQL interpolation.
 * - T-02-07: placeIds.max(25) in Zod schema — rejects large DoS/cost requests before
 *   any Routes API spend.
 * - T-02-08: GOOGLE_PLACES_API_KEY read only from process.env here; passed to
 *   computeRouteMatrix as an argument; never returned in any response.
 * - T-02-09: Unresolved placeIds returned in 422 details list — never silently dropped.
 *
 * Purity boundary:
 *   This Route Handler is the ONLY place in Phase 2 that performs HTTP or DB I/O.
 *   The optimizer (src/lib/optimizer/) must remain free of fetch/DB calls.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ------------------------------------------------------------------
  // Step 1: Parse and validate request body
  // ------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error: OptimizeErrorResponse = { error: "Invalid JSON in request body" };
    return NextResponse.json(error, { status: 400 });
  }

  const parsed = optimizeRequestSchema.safeParse(body);
  if (!parsed.success) {
    const error: OptimizeErrorResponse = {
      error: "Validation failed",
      details: parsed.error.flatten(),
    };
    return NextResponse.json(error, { status: 400 });
  }

  const { placeIds, numDays, travelDate } = parsed.data;

  // ------------------------------------------------------------------
  // Step 2: Load resolved places from the shared places cache
  // ------------------------------------------------------------------
  const rows = await db
    .select()
    .from(places)
    .where(inArray(places.place_id, placeIds));

  // ------------------------------------------------------------------
  // Step 3: Reject requests with unresolved placeIds (T-02-09)
  //
  // A placeId present in the request but absent from the places cache
  // is reported explicitly — the caller must resolve it via
  // GET /api/places/details first. Never silently drop.
  // ------------------------------------------------------------------
  const foundIds = new Set(rows.map((r) => r.place_id));
  const missingIds = placeIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    const error: OptimizeErrorResponse = {
      error: "Unresolved placeIds — resolve them via GET /api/places/details first",
      details: missingIds,
    };
    return NextResponse.json(error, { status: 422 });
  }

  // ------------------------------------------------------------------
  // Step 4: Read server-side API key (T-02-08)
  // ------------------------------------------------------------------
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const error: OptimizeErrorResponse = {
      error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set",
    };
    return NextResponse.json(error, { status: 500 });
  }

  // ------------------------------------------------------------------
  // Step 5: Fetch N×N travel-time matrix — called EXACTLY ONCE (SCHED-03)
  //
  // Coordinates are built in the same order as placeIds to ensure
  // matrix[i][j] aligns with OptimizerPlace[i] → OptimizerPlace[j].
  // ------------------------------------------------------------------

  // Build a lookup map from place_id → row for ordering by placeIds
  const rowMap = new Map(rows.map((r) => [r.place_id, r]));
  const orderedRows = placeIds.map((id) => rowMap.get(id)!);

  const coords: RouteMatrixCoord[] = orderedRows.map((row) => ({
    lat: row.lat,
    lng: row.lng,
  }));

  let matrix: number[][];
  try {
    matrix = await computeRouteMatrix(coords, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: OptimizeErrorResponse = {
      error: `Routes API error: ${message}`,
    };
    return NextResponse.json(error, { status: 502 });
  }

  // ------------------------------------------------------------------
  // Step 6: Map DB rows → OptimizerPlace[]
  //
  // All data comes from the DB cache — the optimizer receives DB-sourced
  // data, never re-fetches from Google (purity boundary).
  //
  // visitDurationMinutes: from default_visit_duration_minutes column.
  //   Falls back to durationForTypes(place_types) if the column is null
  //   (e.g., for places resolved via text search without detail fetch).
  // hoursUnknown: directly from hours_unknown column.
  // openingHours: parsed from opening_hours JSONB column.
  // utcOffsetMinutes: directly from utc_offset_minutes column.
  // ------------------------------------------------------------------
  const optimizerPlaces: OptimizerPlace[] = orderedRows.map((row) => {
    const visitDurationMinutes =
      row.default_visit_duration_minutes ??
      durationForTypes(row.place_types ?? []);

    // Cast the JSONB column to the typed array (stored as OpeningHoursPeriod[])
    const openingHours = row.hours_unknown
      ? null
      : (row.opening_hours as OpeningHoursPeriod[] | null);

    return {
      placeId: row.place_id,
      displayName: row.display_name,
      lat: row.lat,
      lng: row.lng,
      openingHours,
      utcOffsetMinutes: row.utc_offset_minutes ?? null,
      visitDurationMinutes,
      hoursUnknown: row.hours_unknown ?? false,
    };
  });

  // ------------------------------------------------------------------
  // Step 7: Run the pure optimizer (no I/O inside optimize())
  // ------------------------------------------------------------------
  const result = optimize({
    places: optimizerPlaces,
    matrix,
    numDays,
    travelDate,
  });

  // ------------------------------------------------------------------
  // Step 8: Return the locked 02-CONTEXT.md response contract
  // ------------------------------------------------------------------
  return NextResponse.json(result);
}
