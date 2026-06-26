import { NextRequest, NextResponse } from "next/server";
import { resolveRequestSchema, type ResolvedPlace, type ErrorResponse } from "@/lib/validation/resolve";
import { textSearch, type LocationBias } from "@/lib/google/places-client";
import { resolveMapsUrl } from "@/lib/google/url-resolver";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { getUser } from "@/lib/auth/get-user";
import { checkAndCount, subjectFor } from "@/lib/ratelimit/check";

/**
 * POST /api/places/resolve
 *
 * Resolves Chinese place names OR Google Maps URLs to structured place data
 * using Google Places API (New). Each resolved result is upserted into the
 * shared places cache table.
 *
 * Input routing:
 * - URL inputs (starting with "http"): routed through resolveMapsUrl() which
 *   follows redirects and extracts coordinates for a circle-restricted Text Search.
 * - Text inputs: routed through textSearch() with city-based locationBias.
 *
 * Both paths upsert into places and return the same { placeId, displayName,
 * formattedAddress, lat, lng } shape. A null resolution yields a per-input
 * NOT_FOUND marker rather than failing the whole request.
 *
 * Security (threat model):
 * - T-01-01: GOOGLE_PLACES_API_KEY read from process.env (server-only). Never exposed to browser.
 * - T-01-02: Zod validation rejects malformed inputs and missing city with a 400.
 * - T-01-03: textSearch() and resolveMapsUrl() always send X-Goog-FieldMask (Essentials SKU).
 * - T-01-04: locationBias applied on every Text Search (city required by schema).
 * - T-01-14: URL inputs are resolved to coordinates only; response body is never rendered (SSRF mitigation).
 * - T-01-15: API key is server-only, never referenced from client components.
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

  // Rate limiting (SC2): count one lookup per input and reject over the daily cap
  // BEFORE any Google API call. Subject = user id (logged in) or client IP.
  // getUser() is best-effort — resolve stays usable anonymously even if auth is
  // unconfigured (falls back to IP-based limiting).
  let userId: string | null = null;
  try {
    userId = (await getUser())?.id ?? null;
  } catch {
    userId = null;
  }
  const subject = subjectFor(userId, request.headers);
  const rate = await checkAndCount(subject, inputs.length);
  if (!rate.allowed) {
    const error: ErrorResponse = {
      error: `已達每日地點查詢上限（${rate.limit} 次／日），請明天再試。`,
    };
    return NextResponse.json(error, { status: 429 });
  }

  // Server-only API key (T-01-01) — never reference from client components
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set" },
      { status: 500 }
    );
  }

  // Build locationBias for textSearch (text path only)
  const bias: LocationBias | undefined = locationBias
    ? {
        circle: {
          center: { latitude: locationBias.lat, longitude: locationBias.lng },
          radius: locationBias.radiusMeters,
        },
      }
    : undefined;

  // Resolve each input — URL inputs branch to resolveMapsUrl, text to textSearch
  const results: Array<ResolvedPlace | { original_query: string; status: "NOT_FOUND" }> = [];

  for (const input of inputs) {
    let placeResult = null;

    if (input.startsWith("http")) {
      // URL path: follow redirect, extract coordinates, circle-restricted Text Search (T-01-14)
      placeResult = await resolveMapsUrl(input, apiKey);
    } else {
      // Text path: city-based locationBias Text Search (T-01-04)
      placeResult = await textSearch(input, {
        city,
        apiKey,
        locationBias: bias,
      });
    }

    if (!placeResult) {
      // Per-input NOT_FOUND marker — does not fail the whole request.
      // original_query stored for future re-resolution (RESEARCH.md, schema place_visits.original_query).
      results.push({
        original_query: input,
        status: "NOT_FOUND" as const,
      });
      continue;
    }

    // Upsert into the shared places cache when DB is available.
    if (db) {
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
    }

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
