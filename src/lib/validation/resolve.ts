import { z } from "zod";

/**
 * Zod schema for POST /api/places/resolve request body.
 *
 * Security: city is REQUIRED (non-empty) — per CONTEXT.md decision.
 * Requiring city prevents globally-ambiguous searches and enforces locationBias
 * on every Text Search call (T-01-04: Chinese name ambiguity mitigation).
 */
export const resolveRequestSchema = z.object({
  /** Array of place names (Chinese text) or Google Maps URLs to resolve. Min 1 item. */
  inputs: z
    .array(z.string().min(1, "Each input must be a non-empty string"))
    .min(1, "At least one input is required"),

  /**
   * Destination city — REQUIRED before any lookup.
   * Applied as locationBias on every Text Search to prevent cross-city mismatches.
   * Example: "台北市", "高雄市", "京都市"
   */
  city: z.string().min(1, "City is required — it is applied as locationBias on every lookup"),

  /**
   * Optional explicit geographic bias.
   * If provided, overrides the city-derived bias.
   * Useful when the caller has precise coordinates for the search area.
   */
  locationBias: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radiusMeters: z.number().positive().default(50000),
    })
    .optional(),
});

export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

/** Shape of each resolved place returned by the endpoint */
export interface ResolvedPlace {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

/** Standard error response shape from route handlers */
export interface ErrorResponse {
  error: string;
  details?: unknown;
}
