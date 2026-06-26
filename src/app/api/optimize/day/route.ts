import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { computeRouteMatrix, type RouteMatrixCoord } from "@/lib/google/routes-client";
import { scheduleSingleDay } from "@/lib/optimizer/day";
import type { OptimizerPlace } from "@/lib/optimizer/types";
import type { OpeningHoursPeriod } from "@/lib/google/places-client";
import { durationForTypes } from "@/lib/places/duration-table";
import {
  optimizeDayRequestSchema,
  type OptimizeDayErrorResponse,
} from "@/lib/validation/optimize-day";

/**
 * POST /api/optimize/day
 *
 * Single-day re-scheduling endpoint for interactive day editing (Phase 6).
 *
 * Mirrors the existing POST /api/optimize route pattern exactly (same 8-step
 * skeleton) but calls scheduleSingleDay instead of optimize(), and returns
 * { day, unscheduled } instead of a full OptimizeResult (Pitfall 5).
 *
 * Steps:
 *   1. JSON parse → 400
 *   2. Zod validate optimizeDayRequestSchema → 400
 *   3. getDb() null guard → 500
 *   4. DB load: select places WHERE place_id IN placeIds
 *   5. Missing IDs → 422 (T-06-03: never silent drop)
 *   6. GOOGLE_PLACES_API_KEY guard → 500 (T-06-02: key never in response)
 *   7. Build coords in placeIds order (Pitfall 1: orderedRows = placeIds.map(...))
 *      → computeRouteMatrix → 502 on throw
 *   8. Map orderedRows → OptimizerPlace[] → scheduleSingleDay → return { day, unscheduled }
 *
 * Security (threat model):
 * - T-06-01: placeIds.max(25) in schema — rejects DoS/cost requests before Routes API spend.
 * - T-06-02: GOOGLE_PLACES_API_KEY read only from process.env; never in any response.
 * - T-06-03: inArray(places.place_id, placeIds) via Drizzle — parameterized; no raw SQL.
 *
 * Purity boundary:
 *   scheduleSingleDay (src/lib/optimizer/day.ts) must remain free of fetch/DB calls.
 *   All I/O is performed here before the pure function is called.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Step 1: Parse request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error: OptimizeDayErrorResponse = { error: "Invalid JSON in request body" };
    return NextResponse.json(error, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Step 2: Validate with Zod schema
  // -------------------------------------------------------------------------
  const parsed = optimizeDayRequestSchema.safeParse(body);
  if (!parsed.success) {
    const error: OptimizeDayErrorResponse = {
      error: "Validation failed",
      details: parsed.error.flatten(),
    };
    return NextResponse.json(error, { status: 400 });
  }

  const { placeIds, reorder, dayNumber, travelDate } = parsed.data;

  // -------------------------------------------------------------------------
  // Step 3: Database connection guard
  // -------------------------------------------------------------------------
  const db = getDb();
  if (!db) {
    const error: OptimizeDayErrorResponse = {
      error: "Server configuration error: database is not configured",
    };
    return NextResponse.json(error, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // Step 4: Load places from DB cache
  // -------------------------------------------------------------------------
  const rows = await db
    .select()
    .from(places)
    .where(inArray(places.place_id, placeIds));

  // -------------------------------------------------------------------------
  // Step 5: Reject requests with unresolved placeIds (T-06-03)
  //
  // A placeId present in the request but absent from the DB cache is reported
  // explicitly — the caller must resolve it first. Never silently drop.
  // -------------------------------------------------------------------------
  const foundIds = new Set(rows.map((r) => r.place_id));
  const missingIds = placeIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    const error: OptimizeDayErrorResponse = {
      error: "Unresolved placeIds — resolve them via GET /api/places/details first",
      details: missingIds,
    };
    return NextResponse.json(error, { status: 422 });
  }

  // -------------------------------------------------------------------------
  // Step 6: Read server-side API key (T-06-02)
  // -------------------------------------------------------------------------
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const error: OptimizeDayErrorResponse = {
      error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set",
    };
    return NextResponse.json(error, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // Step 7: Build coords in placeIds order, then fetch travel matrix (Pitfall 1)
  //
  // CRITICAL: coords must be built in placeIds order (not DB query return order).
  // db.select().from(places).where(inArray(...)) returns rows in unspecified order.
  // Build orderedRows from placeIds.map(id => rowMap.get(id)!) so that
  // matrix[i][j] aligns with orderedRows[i] → orderedRows[j].
  // -------------------------------------------------------------------------
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
    const error: OptimizeDayErrorResponse = {
      error: `Routes API error: ${message}`,
    };
    return NextResponse.json(error, { status: 502 });
  }

  // -------------------------------------------------------------------------
  // Step 8: Map DB rows → OptimizerPlace[], call scheduleSingleDay, return
  //
  // visitDurationMinutes: uses default_visit_duration_minutes from DB, falls back
  // to durationForTypes(place_types). durationOverrides is OMITTED (not in spec
  // body for v1 — see 06-RESEARCH.md §Open Questions #1).
  //
  // travelDate: ScheduleTimesOpts.travelDate is REQUIRED (Pitfall 3).
  // Default to next Monday when omitted (same default as /api/optimize).
  // nextMonday() is inlined here (not exported from src/lib/optimizer/index.ts).
  // -------------------------------------------------------------------------
  const optimizerPlaces: OptimizerPlace[] = orderedRows.map((row) => {
    const visitDurationMinutes =
      row.default_visit_duration_minutes ??
      durationForTypes(row.place_types ?? []);

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

  // Inline nextMonday() — NOT exported from src/lib/optimizer/index.ts.
  // Source: src/lib/optimizer/index.ts:45-55.
  function nextMonday(): string {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun … 6=Sat
    const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 7;
    const target = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
        daysUntilMonday * 86_400_000
    );
    return target.toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

  // ScheduleTimesOpts.travelDate is required — default to next Monday if omitted.
  const effectiveTravelDate = travelDate ?? nextMonday();

  const { day, unscheduled } = scheduleSingleDay(
    optimizerPlaces,
    matrix,
    {
      dailyStartMinutes: 540,   // 09:00
      dailyEndMinutes: 1260,    // 21:00
      travelDate: effectiveTravelDate,
    },
    { reorder, dayNumber }
  );

  // Return { day, unscheduled } — NOT a full OptimizeResult (Pitfall 5).
  // The client uses replaceDay() to swap only this day in the existing state,
  // preserving suggestedDays and other days.
  return NextResponse.json({ day, unscheduled });
}
