import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { itineraryDays, placeVisits, places } from "@/lib/db/schema";
import type { Itinerary } from "@/lib/db/schema";
import type { OptimizeResult } from "@/lib/optimizer/schedule";
import type { ResolvedPlace } from "@/lib/validation/resolve";

/**
 * A saved itinerary reconstructed into the shape Phase 03's ResultsLayout renders.
 *
 * `itinerary` mirrors the optimizer's OptimizeResult; `resolvedPlaces` supplies the
 * coordinate join (lat/lng) the map needs. `unscheduled` is always empty — we only
 * persist scheduled visits.
 */
export interface LoadedItinerary {
  id: string;
  title: string;
  totalDays: number;
  city: string | null;
  isPublic: boolean;
  shareToken: string | null;
  itinerary: OptimizeResult;
  resolvedPlaces: ResolvedPlace[];
}

/** Postgres `time` returns "HH:MM:SS" — the UI shows "HH:MM". */
function toHHMM(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

/**
 * Reconstruct a saved itinerary's days/visits/places into the view payload.
 * `row` must already be authorized by the caller (owner-scoped or public+shared).
 */
export async function loadItineraryContents(row: Itinerary): Promise<LoadedItinerary> {
  const db = getDb();
  if (!db) throw new Error("database is not configured");

  const days = await db
    .select({ id: itineraryDays.id, day_number: itineraryDays.day_number })
    .from(itineraryDays)
    .where(eq(itineraryDays.itinerary_id, row.id))
    .orderBy(asc(itineraryDays.day_number));

  const resolvedById = new Map<string, ResolvedPlace>();
  const viewDays: OptimizeResult["days"] = [];

  for (const day of days) {
    const visitRows = await db
      .select({
        order_index: placeVisits.order_index,
        scheduled_start: placeVisits.scheduled_start,
        scheduled_end: placeVisits.scheduled_end,
        travel_from_prev: placeVisits.travel_from_prev,
        place_id: places.place_id,
        display_name: places.display_name,
        address: places.address,
        lat: places.lat,
        lng: places.lng,
        hours_unknown: places.hours_unknown,
      })
      .from(placeVisits)
      .innerJoin(places, eq(placeVisits.place_id, places.id))
      .where(eq(placeVisits.itinerary_day_id, day.id))
      .orderBy(asc(placeVisits.order_index));

    viewDays.push({
      dayNumber: day.day_number,
      visits: visitRows.map((v) => ({
        placeId: v.place_id,
        displayName: v.display_name,
        scheduledStart: toHHMM(v.scheduled_start),
        scheduledEnd: toHHMM(v.scheduled_end),
        travelFromPrevMinutes: v.travel_from_prev ?? 0,
        waitMinutes: 0,
        hoursUnknown: v.hours_unknown ?? false,
        ...(v.hours_unknown ? { warning: "營業時間未知，建議出發前確認" } : {}),
      })),
    });

    for (const v of visitRows) {
      if (!resolvedById.has(v.place_id)) {
        resolvedById.set(v.place_id, {
          placeId: v.place_id,
          displayName: v.display_name,
          formattedAddress: v.address ?? "",
          lat: v.lat,
          lng: v.lng,
        });
      }
    }
  }

  return {
    id: row.id,
    title: row.title,
    totalDays: row.total_days,
    city: row.city,
    isPublic: row.is_public ?? false,
    shareToken: row.share_token,
    itinerary: { suggestedDays: row.total_days, days: viewDays, unscheduled: [] },
    resolvedPlaces: Array.from(resolvedById.values()),
  };
}
