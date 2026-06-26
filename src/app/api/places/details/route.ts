import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { placeDetails } from "@/lib/google/places-client";
import { durationForTypes } from "@/lib/places/duration-table";
import { eq, and, gt, sql } from "drizzle-orm";

/**
 * GET /api/places/details?placeId=ChIJ...
 *
 * Returns full place details (opening hours, coordinates, derived visit duration)
 * using a 30-day cache-first strategy. Only calls Google Places API on a cache
 * miss or stale row (updated_at older than 30 days).
 *
 * Security (threat model):
 * - T-01-09: 30-day cache-first prevents repeat Enterprise SKU billing.
 * - T-01-10: Missing/invalid placeId returns 400 before any Google call.
 *   The placeId is used only as a Google lookup key and a parameterized Drizzle
 *   query value — it is never interpolated as raw SQL.
 * - T-01-11: GOOGLE_PLACES_API_KEY read only server-side from process.env.
 * - T-01-12: hours_unknown = true when regularOpeningHours is absent (Pitfall 3).
 *
 * Response shape (success):
 * {
 *   placeId, displayName, formattedAddress, lat, lng,
 *   openingHours,          // regularOpeningHours.periods[] | null
 *   utcOffsetMinutes,      // for Phase 2 timezone-correct scheduling
 *   defaultVisitDurationMinutes, // derived from place types
 *   priceLevel, rating, types,
 *   hoursUnknown,          // true when opening hours were not returned by Google
 *   cached                 // boolean — true if served from DB without a Google call
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId");

  // T-01-10: validate required placeId before any external call
  if (!placeId || placeId.trim() === "") {
    return NextResponse.json(
      { error: "Missing required query parameter: placeId" },
      { status: 400 }
    );
  }

  // Cache-first: check for a fresh row (updated_at within the last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const cached = db
    ? await db
        .select()
        .from(places)
        .where(
          and(eq(places.place_id, placeId), gt(places.updated_at, thirtyDaysAgo))
        )
        .limit(1)
    : [];

  if (cached.length > 0) {
    // Cache HIT — return DB row without any Google API call (T-01-09)
    const row = cached[0];
    return NextResponse.json({
      placeId: row.place_id,
      displayName: row.display_name,
      formattedAddress: row.address,
      lat: row.lat,
      lng: row.lng,
      openingHours: row.opening_hours,
      utcOffsetMinutes: row.utc_offset_minutes,
      defaultVisitDurationMinutes: row.default_visit_duration_minutes,
      priceLevel: row.price_level,
      rating: row.rating !== null ? Number(row.rating) : null,
      types: row.place_types,
      hoursUnknown: row.hours_unknown,
      cached: true,
    });
  }

  // Cache MISS — fetch from Google Places API (Enterprise SKU)
  // T-01-11: API key is read only server-side, never client-side
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set" },
      { status: 500 }
    );
  }

  let details;
  try {
    details = await placeDetails(placeId, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Google Places API error: ${message}` },
      { status: 502 }
    );
  }

  // Derive default visit duration from place types (for Phase 2 optimizer)
  const defaultVisitDurationMinutes = durationForTypes(details.types);

  // Upsert into the shared places cache when DB is available.
  // On conflict of place_id: update all detail columns and refresh updated_at
  if (db) {
    await db
      .insert(places)
      .values({
      place_id: details.placeId,
      display_name: details.displayName,
      address: details.formattedAddress,
      lat: details.lat,
      lng: details.lng,
      opening_hours: details.openingHours as unknown as Record<string, unknown>[],
      utc_offset_minutes: details.utcOffsetMinutes,
      place_types: details.types,
      price_level: details.priceLevel
        ? parsePriceLevel(details.priceLevel)
        : null,
      rating: details.rating !== null ? String(details.rating) : null,
      default_visit_duration_minutes: defaultVisitDurationMinutes,
      hours_unknown: details.hoursUnknown,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: places.place_id,
      set: {
        display_name: details.displayName,
        address: details.formattedAddress,
        lat: details.lat,
        lng: details.lng,
        opening_hours: details.openingHours as unknown as Record<string, unknown>[],
        utc_offset_minutes: details.utcOffsetMinutes,
        place_types: details.types,
        price_level: details.priceLevel
          ? parsePriceLevel(details.priceLevel)
          : null,
        rating: details.rating !== null ? String(details.rating) : null,
        default_visit_duration_minutes: defaultVisitDurationMinutes,
        hours_unknown: details.hoursUnknown,
        updated_at: new Date(),
      },
    });
  }

  return NextResponse.json({
    placeId: details.placeId,
    displayName: details.displayName,
    formattedAddress: details.formattedAddress,
    lat: details.lat,
    lng: details.lng,
    openingHours: details.openingHours,
    utcOffsetMinutes: details.utcOffsetMinutes,
    defaultVisitDurationMinutes,
    priceLevel: details.priceLevel ? parsePriceLevel(details.priceLevel) : null,
    rating: details.rating,
    types: details.types,
    hoursUnknown: details.hoursUnknown,
    cached: false,
  });
}

/**
 * Maps Google's PRICE_LEVEL_* enum string to an integer (0–4).
 * Returns null for unrecognized values.
 */
function parsePriceLevel(priceLevel: string): number | null {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[priceLevel] ?? null;
}
