/**
 * Google Routes API — computeRouteMatrix client.
 *
 * IMPORTANT: This module is server-side only.
 * - Never import from client components.
 * - API key is passed explicitly — never read from client-accessible env vars.
 * - X-Goog-FieldMask is ALWAYS set to control billing SKU.
 * - X-Goog-Api-Key is the authentication mechanism (not a Bearer token).
 *
 * Endpoint: routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
 * (Routes API, not Directions API which was deprecated March 2025)
 *
 * Security (threat model):
 * - T-02-08: API key passed as an explicit argument, sourced from process.env only
 *   in the Route Handler — never embedded in client bundles.
 */

/** Field mask for the computeRouteMatrix call — controls billing to Essentials SKU. */
export const ROUTES_MATRIX_FIELD_MASK =
  "originIndex,destinationIndex,duration,condition";

/** A geographic coordinate used as an origin or destination for the matrix. */
export interface RouteMatrixCoord {
  lat: number;
  lng: number;
}

const ROUTES_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

/**
 * Transforms a RouteMatrixCoord into the Routes API waypoint shape.
 *
 * Routes API waypoint format:
 *   { waypoint: { location: { latLng: { latitude, longitude } } } }
 */
function toWaypoint(coord: RouteMatrixCoord): object {
  return {
    waypoint: {
      location: {
        latLng: {
          latitude: coord.lat,
          longitude: coord.lng,
        },
      },
    },
  };
}

/**
 * Parses a Routes API duration string (e.g., "1234s") to a number of seconds.
 *
 * The Routes API returns duration as a string like "600s". This strips the
 * trailing "s" and parses the numeric portion.
 */
function parseDurationSeconds(duration: string): number {
  // "600s" → 600, "0s" → 0
  return parseFloat(duration.replace(/s$/, ""));
}

/**
 * Fetches an N×N travel-time matrix from the Google Routes API.
 *
 * - Makes a single POST to computeRouteMatrix.
 * - Returns a number[][] where matrix[i][j] = travel minutes from coord i to coord j.
 * - Diagonal entries (i === j) are always 0.
 * - Pairs without a ROUTE_EXISTS element are set to Number.MAX_SAFE_INTEGER,
 *   so the optimizer never treats an unreachable pair as zero-cost travel.
 * - Throws on non-OK HTTP responses (mirrors places-client behavior).
 *
 * @param coords  Array of N geographic coordinates (origins and destinations are both this full set).
 * @param apiKey  Server-side API key — must have Routes API enabled (T-02-08).
 * @returns       N×N travel-time matrix in minutes.
 * @throws        Error when the Google API returns a non-OK status.
 */
export async function computeRouteMatrix(
  coords: RouteMatrixCoord[],
  apiKey: string
): Promise<number[][]> {
  const n = coords.length;

  // Initialize the matrix: all entries as MAX_SAFE_INTEGER (sentinel for unreachable).
  // Diagonal entries are 0 (same origin and destination = 0 travel time).
  const matrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Number.MAX_SAFE_INTEGER))
  );

  const requestBody = {
    origins: coords.map(toWaypoint),
    destinations: coords.map(toWaypoint),
    travelMode: "DRIVE",
  };

  const response = await fetch(ROUTES_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTES_MATRIX_FIELD_MASK,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Routes API error ${response.status}: ${text}`
    );
  }

  // The Routes API returns a flat array of elements, each representing one
  // (origin, destination) pair. Elements may be absent if the route could not
  // be computed — those pairs remain at MAX_SAFE_INTEGER (sentinel).
  const elements: Array<{
    originIndex?: number;
    destinationIndex?: number;
    condition?: string;
    duration?: string;
  }> = await response.json();

  for (const element of elements) {
    const { originIndex, destinationIndex, condition, duration } = element;

    // Only set the matrix entry when:
    //   1. originIndex and destinationIndex are present
    //   2. condition is explicitly ROUTE_EXISTS (not ROUTE_NOT_FOUND or other)
    //   3. duration string is present
    if (
      originIndex == null ||
      destinationIndex == null ||
      condition !== "ROUTE_EXISTS" ||
      duration == null
    ) {
      // Leave the sentinel in place — this pair is unreachable.
      continue;
    }

    const seconds = parseDurationSeconds(duration);
    const minutes = Math.round(seconds / 60);

    // Off-diagonal ROUTE_EXISTS: set the computed minute value.
    // Diagonal entries stay 0 (even if the API returns them with 0s).
    if (originIndex !== destinationIndex) {
      matrix[originIndex][destinationIndex] = minutes;
    }
    // If originIndex === destinationIndex and ROUTE_EXISTS, leave it as 0 (already set).
  }

  return matrix;
}
