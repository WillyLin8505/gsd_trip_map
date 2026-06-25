import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestSchema, type ResolvedPlace, type ErrorResponse } from "@/lib/validation/resolve";
import { textSearch, type LocationBias } from "@/lib/google/places-client";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * POST /api/places/resolve
 *
 * Resolves Chinese place names to structured place data using Google Places API (New).
 * Each resolved result is upserted into the shared places cache table.
 *
 * Security (threat model):
 * - T-01-01: GOOGLE_PLACES_API_KEY read from process.env (server-only). Never exposed to browser.
 * - T-01-02: Zod validation rejects malformed inputs and missing city with a 400.
 * - T-01-03: textSearch() always sends X-Goog-FieldMask (Essentials SKU only).
 * - T-01-04: locationBias applied on every Text Search (city required by schema).
 *
 * Note: URL input handling is deferred to Plan 04. In this plan, all inputs are treated as text names.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Parse and validate request body (T-01-02)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error: ErrorResponse = { error: "Invalid JSON in request body" };
    return NextResponse.json(error, { status: 400 });
  }

  const parsed = resolveRequestSchema.safeParse(body);
  if (!parsed.success) {
    const error: ErrorResponse = {
      error: "Validation failed",
      details: parsed.error.flatten(),
    };
    return NextResponse.json(error, { status: 400 });
  }

  const { inputs, city, locationBias } = parsed.data;

  // Server-only API key (T-01-01) — never reference from client components
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set" },
      { status: 500 }
    );
  }

  // Build locationBias for textSearch
  const bias: LocationBias | undefined = locationBias
    ? {
        circle: {
          center: { latitude: locationBias.lat, longitude: locationBias.lng },
          radius: locationBias.radiusMeters,
        },
      }
    : undefined;

  // Resolve each input
  const results: ResolvedPlace[] = [];

  for (const input of inputs) {
    // Plan 04 will detect URLs (starts with 'http') and follow redirects.
    // In this plan, all inputs are treated as text names.
    const placeResult = await textSearch(input, {
      city,
      apiKey,
      locationBias: bias,
    });

    if (!placeResult) {
      // Return a partial result with null indicator for this input
      // Front-end can show "not found" for this entry
      continue;
    }

    // Upsert into the shared places cache (T-01-03 cost control: one DB write per unique place)
    // On conflict of place_id, update the mutable fields and refresh updated_at
    await db
      .insert(places)
      .values({
        place_id: placeResult.placeId,
        display_name: placeResult.displayName,
        address: placeResult.formattedAddress,
        lat: placeResult.lat,
        lng: placeResult.lng,
        hours_unknown: false,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: places.place_id,
        set: {
          display_name: placeResult.displayName,
          address: placeResult.formattedAddress,
          lat: placeResult.lat,
          lng: placeResult.lng,
          updated_at: new Date(),
        },
      });

    results.push({
      placeId: placeResult.placeId,
      displayName: placeResult.displayName,
      formattedAddress: placeResult.formattedAddress,
      lat: placeResult.lat,
      lng: placeResult.lng,
    });
  }

  return NextResponse.json(results);
}
