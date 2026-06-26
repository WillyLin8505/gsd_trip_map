import { z } from "zod";

/**
 * Zod schema for POST /api/optimize/day request body.
 *
 * Security (threat model):
 * - T-06-01: placeIds length capped at 25 (same DoS cap as existing optimize route T-02-07).
 *   Requests exceeding this cap are rejected with 400 before any Routes API spend.
 * - T-06-02: GOOGLE_PLACES_API_KEY never in this schema; read server-side only.
 * - T-06-03: placeIds used in Drizzle inArray — parameterized, never raw SQL.
 *
 * v1 known limitation: durationOverrides is omitted from this schema.
 * The existing /api/optimize route accepts durationOverrides (INPUT-05), but the
 * day route spec body does not include it. If a user had overridden durations before
 * generating the itinerary, those overrides are not forwarded to day-route re-scheduling.
 * This is acceptable per 06-RESEARCH.md §Open Questions #1.
 */
export const optimizeDayRequestSchema = z.object({
  /**
   * Google place IDs to schedule for this single day.
   * Min 1, Max 25 (Routes API per-request element cap: 25×25 = 625 elements).
   * Each must be a non-empty string.
   */
  placeIds: z
    .array(z.string().min(1, "Each placeId must be a non-empty string"))
    .min(1, "At least one placeId is required")
    .max(25, "Maximum 25 placeIds per request (Routes API 625-element cap)")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "placeIds must be unique — duplicate IDs would schedule the same place twice"
    ),

  /**
   * Whether to reorder places by shortest-path + meal-slotting (F2).
   * false = keep given order and only re-time (F1).
   * true  = full reorder (F2 — implemented in plan 06-02).
   */
  reorder: z.boolean(),

  /**
   * 1-based day number for the output (day.dayNumber in the response).
   * Defaults to 1 when omitted.
   */
  dayNumber: z.number().int().min(1).default(1),

  /**
   * Optional ISO-8601 date of the travel day (e.g. "2026-07-01").
   * Used to determine day-of-week for opening-hours feasibility checks.
   * When omitted, the route defaults to next Monday (same as /api/optimize).
   */
  travelDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "travelDate must be an ISO date string in YYYY-MM-DD format"
    )
    .optional(),
});

export type OptimizeDayRequest = z.infer<typeof optimizeDayRequestSchema>;

/** Standard error response shape (mirrors optimize.ts convention). */
export interface OptimizeDayErrorResponse {
  error: string;
  details?: unknown;
}
