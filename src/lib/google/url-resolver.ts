/**
 * Google Maps URL resolver — server-side only.
 *
 * Resolves Google Maps short URLs (maps.app.goo.gl) and full URLs containing
 * coordinate patterns (/@lat,lng) to a structured PlaceResult by:
 *   1. Expanding short URLs via HTTP redirect follow (HEAD with GET fallback).
 *   2. Extracting the /@lat,lng coordinate pattern from the expanded URL.
 *   3. Issuing a coordinate-restricted Text Search (circle, radius 100m) using
 *      the Essentials field mask to identify the place at those coordinates.
 *
 * Security:
 *   - T-01-14 (SSRF): Only the /@lat,lng coordinates from the redirect target are
 *     used — the response body is never fetched or rendered. The coordinates are
 *     fed to Google Text Search only.
 *   - T-01-15: API key is passed from the server route; this module is server-side
 *     only and must never be imported by client components.
 *   - T-01-16: fetch redirect "follow" caps redirect chains by default; a URL that
 *     yields no coordinates returns null (NOT_FOUND) rather than crashing.
 *
 * Base URL: places.googleapis.com/v1 (New API only — never legacy /maps/api/place/)
 */

import { ESSENTIALS_FIELD_MASK, type PlaceResult } from "./places-client";

/** Coordinate pattern in Google Maps URLs: /@<lat>,<lng>[,zoom] */
const COORD_REGEX = /\/@(-?\d+\.\d+),(-?\d+\.\d+)/;

/** Places API Text Search endpoint (New) */
const PLACES_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

/**
 * A set of hostnames that are known Google Maps short-URL hosts.
 * We follow redirects for these to obtain the expanded URL.
 */
const SHORT_URL_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
]);

/**
 * Determines whether a URL string requires redirect-following to obtain the
 * expanded Google Maps URL with coordinates.
 */
function isShortUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SHORT_URL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts { lat, lng } from a Google Maps URL containing the /@lat,lng pattern.
 * Returns null if the pattern is not present.
 */
function extractCoordinates(
  url: string
): { lat: number; lng: number } | null {
  const match = COORD_REGEX.exec(url);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

/**
 * Follows redirects for a URL by issuing a HEAD request (and falling back to
 * GET when HEAD does not return a usable expanded URL). Returns the final
 * redirect target URL as a string.
 *
 * The injectable fetchImpl parameter allows this to be unit-tested without
 * making real network requests.
 *
 * EMPIRICAL SPIKE NOTE: During the Phase 1 spike (see SUMMARY), testing of
 * real maps.app.goo.gl URLs showed that fetch() with { redirect: "follow" }
 * resolves the final URL through response.url. The HEAD method sufficed for
 * the tested URLs; the GET fallback is retained for robustness per RESEARCH.md.
 */
async function expandUrl(
  url: string,
  fetchImpl: typeof fetch
): Promise<string> {
  // Try HEAD first — follows redirects and gives us the final URL
  try {
    const headResponse = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
    });

    const finalUrl = headResponse.url;
    // A usable expanded URL must differ from the input (i.e., a redirect occurred
    // or the input is already expanded) AND must contain the coordinate pattern.
    if (finalUrl && finalUrl !== url && COORD_REGEX.test(finalUrl)) {
      return finalUrl;
    }

    // HEAD returned the expanded URL but it may not have the coord pattern —
    // still return it so the caller can decide whether to use it.
    if (finalUrl && finalUrl !== url) {
      return finalUrl;
    }
  } catch {
    // HEAD failed — fall through to GET
  }

  // GET fallback: some short URLs require a full GET to follow the redirect
  const getResponse = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
  });
  return getResponse.url || url;
}

/**
 * Issues a coordinate-restricted Text Search (New) using a circle
 * locationRestriction with a 100-meter radius centered on the given coordinates.
 *
 * Uses the Essentials field mask to stay in the lower billing SKU.
 * Returns the top result mapped to PlaceResult, or null when no places are found.
 *
 * The injectable fetchImpl allows unit testing without real network calls.
 */
async function coordinateSearch(
  lat: number,
  lng: number,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<PlaceResult | null> {
  // Use a nearby search via Text Search with locationRestriction (circle, 100m).
  // The textQuery is a generic nearby search — coordinates do the heavy lifting.
  const requestBody = {
    textQuery: "nearby",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 100,
      },
    },
  };

  const response = await fetchImpl(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // The Essentials field mask uses places.* prefix for Text Search
      "X-Goog-FieldMask": ESSENTIALS_FIELD_MASK,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // New API returns data.places[] — never data.results[] (legacy)
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
    displayName: place.displayName?.text ?? "",
    formattedAddress: place.formattedAddress ?? "",
    lat: place.location?.latitude ?? lat,
    lng: place.location?.longitude ?? lng,
  };
}

/**
 * Resolves a Google Maps URL (short or full) to a structured PlaceResult.
 *
 * Pipeline:
 *   1. If the URL is a short URL (maps.app.goo.gl, etc.), follow redirects
 *      (HEAD first, GET fallback) to obtain the expanded URL.
 *   2. Extract /@lat,lng coordinates from the expanded URL.
 *   3. If coordinates are found, issue a circle-restricted Text Search (radius 100m)
 *      and return the top result as { placeId, displayName, formattedAddress, lat, lng }.
 *   4. If no coordinates are found, return null (caller surfaces NOT_FOUND).
 *
 * @param url        - A Google Maps URL (short or full). Must begin with "http".
 * @param apiKey     - Server-side API key (IP-restricted, Places API New only).
 * @param fetchImpl  - Injectable fetch implementation (defaults to global fetch).
 *                     Override in tests to avoid real network requests.
 * @returns A resolved PlaceResult or null when no place can be identified.
 */
export async function resolveMapsUrl(
  url: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceResult | null> {
  // Step 1: Expand short URLs to get the full URL with coordinates
  let expandedUrl = url;
  if (isShortUrl(url)) {
    expandedUrl = await expandUrl(url, fetchImpl);
  }

  // Step 2: Extract coordinates from the expanded URL
  const coords = extractCoordinates(expandedUrl);
  if (!coords) {
    return null;
  }

  // Step 3: Coordinate-restricted Text Search to identify the place
  return coordinateSearch(coords.lat, coords.lng, apiKey, fetchImpl);
}
