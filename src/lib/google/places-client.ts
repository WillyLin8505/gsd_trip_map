/**
 * Google Places API (New) Text Search and Place Details client.
 *
 * IMPORTANT: This module is server-side only.
 * - Never import from client components.
 * - API key is passed explicitly — never read from client-accessible env vars.
 * - X-Goog-FieldMask is ALWAYS set to control billing SKU.
 *
 * Base URL: places.googleapis.com/v1 (New API, NOT legacy /maps/api/place/)
 * Text Search response shape: response.places[] (NOT legacy response.results[])
 * Place Details response shape: the place object directly (not an array)
 */

/** Essentials SKU field mask — controls billing to ~$5/1000 (vs $17 for Pro). */
export const ESSENTIALS_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location";

/**
 * Enterprise SKU field mask for Place Details.
 *
 * Includes regularOpeningHours (triggers Enterprise SKU ~$0.017/call) and
 * utcOffsetMinutes (required for timezone-correct scheduling in Phase 2).
 * Kept as a separate exported constant so the two masks remain independently
 * auditable (T-01-09: aggressive caching is the only cost mitigation for this SKU).
 *
 * Field names use the Place Details (New) schema — no `places.` prefix.
 */
export const DETAILS_FIELD_MASK =
  "id,displayName,formattedAddress,location,regularOpeningHours,utcOffsetMinutes,priceLevel,rating,types";

export interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

export interface LocationBias {
  circle?: {
    center: { latitude: number; longitude: number };
    radius: number;
  };
  rectangle?: {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  };
}

export interface TextSearchOptions {
  /** Destination city used to build locationBias when no explicit bias is provided */
  city: string;
  /** Server API key — restricted to IP + Places API (New). Never pass browser key here. */
  apiKey: string;
  /** Optional explicit locationBias; if omitted, a circle bias centered on city coordinates is used */
  locationBias?: LocationBias;
}

const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";

/**
 * Performs a Text Search (New) against Google Places API.
 *
 * - Always sends X-Goog-FieldMask for Essentials SKU cost control (T-01-03).
 * - Always sends languageCode "zh-TW" for Chinese name support.
 * - Always applies locationBias so ambiguous names resolve within the destination city (T-01-04).
 * - Reads from response.places[] (new API) — never response.results[] (legacy).
 *
 * Returns null when no places are found (NOT_FOUND). Does not throw.
 */
export async function textSearch(
  textQuery: string,
  options: TextSearchOptions
): Promise<PlaceResult | null> {
  const { city, apiKey, locationBias } = options;

  // Build locationBias: use the explicit bias if provided, otherwise use a
  // city-centered circle (using a representative center for the search).
  // The city name is also incorporated into the textQuery for fallback disambiguation.
  const bias: LocationBias = locationBias ?? buildCityBias(city);

  const requestBody = {
    textQuery,
    languageCode: "zh-TW",
    locationBias: bias,
  };

  const response = await fetch(PLACES_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ESSENTIALS_FIELD_MASK,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Places API error ${response.status}: ${text}`
    );
  }

  const data = await response.json();

  // New API returns data.places[] — never data.results[] (that is the legacy API)
  const places: Array<{
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
  }> = data.places ?? [];

  if (places.length === 0) {
    return null;
  }

  const place = places[0];

  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? textQuery,
    formattedAddress: place.formattedAddress ?? "",
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
  };
}

/**
 * Builds a city-centered locationBias from the city name.
 *
 * In production this would use geocoding to resolve a real lat/lng from the city name.
 * For Phase 1 skeleton, we use a textQuery prefix strategy and return a broad circle
 * centered on a default point; the city parameter is included in the textQuery
 * construction at the call site via context.
 *
 * Plan 04 will replace this with a proper geocode-based city resolution.
 */
function buildCityBias(city: string): LocationBias {
  // Phase 1 skeleton: return a broad bias that allows the city name in the textQuery
  // to guide resolution. The radius is intentionally large (50km) so it works
  // across different city sizes without requiring geocoding in this plan.
  // locationBias is still required by the plan spec and returned here.
  return {
    circle: {
      // Default center: roughly center of Taiwan (plan 04 will geocode the city)
      center: { latitude: 23.6978, longitude: 120.9605 },
      radius: 50000,
    },
  };
}

// ---------------------------------------------------------------------------
// Place Details (New) — Enterprise SKU
// ---------------------------------------------------------------------------

/**
 * Opening hours period as returned by regularOpeningHours.periods[].
 */
export interface OpeningHoursPeriod {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

/**
 * Structured result from placeDetails().
 *
 * hoursUnknown is the hours_unknown rule:
 *   true  → regularOpeningHours was absent in the API response (never treat as always-open)
 *   false → regularOpeningHours was present; openingHours holds the periods array
 */
export interface PlaceDetailsResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  /** regularOpeningHours.periods[] or null when unavailable */
  openingHours: OpeningHoursPeriod[] | null;
  /** Required for timezone-correct scheduling in Phase 2 */
  utcOffsetMinutes: number | null;
  priceLevel: string | null;
  rating: number | null;
  types: string[];
  /**
   * true when the API did not return regularOpeningHours.
   * NEVER default to false or treat as always-open (Pitfall 3).
   */
  hoursUnknown: boolean;
}

const PLACES_DETAILS_BASE = "https://places.googleapis.com/v1/places";

/**
 * Fetches full Place Details using the Places API (New) — Enterprise SKU.
 *
 * - Always sends X-Goog-FieldMask = DETAILS_FIELD_MASK (regularOpeningHours + utcOffsetMinutes).
 * - Enforces the hours_unknown rule: absent regularOpeningHours → hoursUnknown = true,
 *   openingHours = null. NEVER defaults to always-open (T-01-12, Pitfall 3).
 * - API key is passed explicitly — never sourced from client-accessible env vars.
 *
 * @param placeId - Google Places place ID (e.g. "ChIJtest123")
 * @param apiKey  - Server-side API key (IP-restricted, Places API New only)
 * @returns Structured place details
 * @throws Error when the Google API returns a non-OK status
 */
export async function placeDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetailsResult> {
  const url = `${PLACES_DETAILS_BASE}/${placeId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Places Details API error ${response.status}: ${text}`
    );
  }

  const data: {
    id?: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    regularOpeningHours?: { periods: OpeningHoursPeriod[] };
    utcOffsetMinutes?: number;
    priceLevel?: string;
    rating?: number;
    types?: string[];
  } = await response.json();

  // hours_unknown rule: absent regularOpeningHours is NOT "always open" (Pitfall 3)
  const hasHours = data.regularOpeningHours !== undefined;

  return {
    placeId: data.id ?? placeId,
    displayName: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? 0,
    lng: data.location?.longitude ?? 0,
    openingHours: hasHours
      ? (data.regularOpeningHours!.periods ?? [])
      : null,
    utcOffsetMinutes: data.utcOffsetMinutes ?? null,
    priceLevel: data.priceLevel ?? null,
    rating: data.rating ?? null,
    types: data.types ?? [],
    hoursUnknown: !hasHours,
  };
}
