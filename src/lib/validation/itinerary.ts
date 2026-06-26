import { z } from "zod";

/**
 * Zod schema for POST /api/itineraries — saving an itinerary (AUTH-04).
 *
 * The client sends the optimizer output reshaped into a relational payload:
 * itinerary → days → visits. Visits reference the Google place_id; the server
 * maps those to places.id (UUID) when writing place_visits.
 *
 * Validation caps (cost/abuse): max 30 days, max 25 visits/day — comfortably above
 * any realistic single trip while bounding write size.
 */
export const saveVisitSchema = z.object({
  placeId: z.string().min(1),
  orderIndex: z.number().int().min(0),
  scheduledStart: z.string().nullable().optional(),
  scheduledEnd: z.string().nullable().optional(),
  travelFromPrev: z.number().int().nullable().optional(),
});

export const saveDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  visits: z.array(saveVisitSchema).max(25),
});

export const saveItinerarySchema = z.object({
  title: z.string().trim().min(1, "請輸入行程標題").max(120),
  totalDays: z.number().int().min(1).max(30),
  city: z.string().trim().optional(),
  region: z.string().trim().optional(),
  days: z.array(saveDaySchema).min(1).max(30),
});

export type SaveItineraryRequest = z.infer<typeof saveItinerarySchema>;

/**
 * Zod schema for PATCH /api/itineraries/:id — currently only the sharing toggle (AUTH-05).
 */
export const updateItinerarySchema = z.object({
  isPublic: z.boolean(),
});

export type UpdateItineraryRequest = z.infer<typeof updateItinerarySchema>;
