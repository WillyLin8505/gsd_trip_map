/**
 * Visit duration lookup table derived from Google place types.
 *
 * Used by the Phase 2 optimizer to derive a default visit time when no user
 * override is provided. Values are in minutes.
 *
 * Priority order is significant: the FIRST matching type in this list wins.
 * This ensures:
 * - cafe/coffee_shop resolves to 30 min (not the 60-min food group)
 * - amusement_park/zoo/aquarium resolve to 240 min before tourist_attraction
 *
 * Fallback: 60 minutes when no type matches (including empty arrays).
 *
 * Source: .planning/phases/01-foundation-api-integration/01-RESEARCH.md
 */

const FALLBACK_DURATION_MINUTES = 60;

/**
 * Priority-ordered list of [types, minutes] pairs.
 *
 * The first entry whose type set intersects with the input types array wins.
 * Ordering ensures cafe (30 min) is tested before the broader food group (60 min).
 */
const DURATION_PRIORITY_TABLE: Array<{ types: Set<string>; minutes: number }> =
  [
    // Museum / gallery — 120 min
    { types: new Set(["museum", "art_gallery"]), minutes: 120 },
    // Amusement / theme / wildlife — 240 min (long-day attractions)
    {
      types: new Set(["amusement_park", "theme_park", "aquarium", "zoo"]),
      minutes: 240,
    },
    // Cafes / coffee shops — 30 min (must precede the food group to win tie)
    { types: new Set(["cafe", "coffee_shop"]), minutes: 30 },
    // Restaurants / food — 60 min
    { types: new Set(["restaurant", "food", "bakery"]), minutes: 60 },
    // Landmarks / points of interest — 45 min
    {
      types: new Set([
        "tourist_attraction",
        "point_of_interest",
        "landmark",
      ]),
      minutes: 45,
    },
    // Parks / nature — 90 min
    {
      types: new Set([
        "park",
        "national_park",
        "natural_feature",
        "campground",
      ]),
      minutes: 90,
    },
    // Shopping — 90 min
    { types: new Set(["shopping_mall", "department_store"]), minutes: 90 },
    // Wellness — 60 min
    { types: new Set(["spa", "beauty_salon"]), minutes: 60 },
  ];

/**
 * Derives the default visit duration in minutes from a place's Google types array.
 *
 * Iterates through the input types in order and returns the duration for the
 * first type that appears in the priority table. If no type matches, returns
 * the 60-minute fallback.
 *
 * @param types - Google place types array from the Place Details response.
 * @returns Default visit duration in minutes.
 */
export function durationForTypes(types: string[]): number {
  for (const type of types) {
    for (const entry of DURATION_PRIORITY_TABLE) {
      if (entry.types.has(type)) {
        return entry.minutes;
      }
    }
  }
  return FALLBACK_DURATION_MINUTES;
}

/**
 * The underlying duration map exposed for auditing and testing.
 * Maps each Google place type to its assigned default duration in minutes.
 */
export const DURATION_TABLE: ReadonlyMap<string, number> = new Map(
  DURATION_PRIORITY_TABLE.flatMap((entry) =>
    [...entry.types].map((type) => [type, entry.minutes] as [string, number])
  )
);
