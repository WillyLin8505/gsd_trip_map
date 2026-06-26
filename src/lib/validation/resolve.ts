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
   * Destination city — OPTIONAL. When omitted/blank, the resolve route infers it
   * from the inputs (Claude Haiku) and uses that for locationBias. When provided,
   * it is used directly. Example: "台北市", "高雄市", "京都市"
   */
  city: z.string().trim().min(1).optional(),

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

/** NOT_FOUND marker for a single input that did not resolve. */
export interface NotFoundMarker {
  original_query: string;
  status: "NOT_FOUND";
}

/** Response body of POST /api/places/resolve. */
export interface ResolveResponse {
  places: Array<ResolvedPlace | NotFoundMarker>;
  /** City actually used for biasing (provided or inferred); null if none. */
  resolvedCity: string | null;
  /** True when resolvedCity was inferred by the LLM (not user-provided). */
  cityInferred: boolean;
}

/** Standard error response shape from route handlers */
export interface ErrorResponse {
  error: string;
  details?: unknown;
}
