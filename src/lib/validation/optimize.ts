import { z } from "zod";

/**
 * Zod schema for POST /api/optimize request body.
 *
 * Security (threat model):
 * - T-02-06: placeIds validated as non-empty string[]; each must be a non-empty string.
 * - T-02-07: placeIds length capped at 25 (Routes API ≤25 waypoints / 625 elements).
 *   Requests exceeding this cap are rejected with 400 before any Routes API spend.
 * - T-02-08: GOOGLE_PLACES_API_KEY never in this schema; it is read server-side only.
 *
 * numDays must be a positive integer (>=1) when provided.
 * travelDate must be an ISO date string (YYYY-MM-DD) when provided.
 */
export const optimizeRequestSchema = z.object({
  /**
   * Array of Google place IDs already resolved and cached in the places table.
   * Min 1, Max 25 (Routes API per-request element cap: 25×25 = 625 elements).
   * Each must be a non-empty string.
   */
  placeIds: z
    .array(z.string().min(1, "Each placeId must be a non-empty string"))
    .min(1, "At least one placeId is required")
    .max(25, "Maximum 25 placeIds per request (Routes API 625-element cap)"),

  /**
   * Optional number of days to spread the itinerary across.
   * Must be a positive integer >= 1.
   * When omitted, the optimizer auto-calculates the day count (SCHED-01).
   */
  numDays: z
    .number()
    .int("numDays must be an integer")
    .min(1, "numDays must be at least 1")
    .optional(),

  /**
   * Optional ISO-8601 date of the first travel day (e.g. "2026-07-01").
   * Used to determine day-of-week for opening-hours feasibility checks.
   * When omitted, defaults to next Monday.
   */
  travelDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "travelDate must be an ISO date string in YYYY-MM-DD format"
    )
    .optional(),
});

export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;

/** Standard error response shape (mirrors resolve.ts convention). */
export interface OptimizeErrorResponse {
  error: string;
  details?: unknown;
}
