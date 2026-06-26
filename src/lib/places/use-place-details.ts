"use client";

import { useState, useEffect, useRef } from "react";
import type { PlaceDetail } from "@/types/itinerary";

/**
 * usePlaceDetails — fetches and caches place detail data for a set of placeIds.
 *
 * Contract:
 * - GETs /api/places/details?placeId=X for each unique placeId.
 * - Dedupes in-flight requests: the same placeId is never fetched twice per mount.
 * - Returns a Map<placeId, PlaceDetail> as results accumulate.
 * - Per-id failures are tolerated: failed ids are omitted from the Map.
 *   PlaceRow falls back to the ScheduledVisit.hoursUnknown flag in that case.
 * - loading=true while any fetch is still pending.
 *
 * Security (T-03-07):
 * - placeId originates from the resolve response (server-issued); it is encoded with
 *   encodeURIComponent when appended to the query string.
 *
 * Performance (T-03-08):
 * - Fetches each unique id exactly once (Set-based dedup via the fetchedRef ref).
 * - The details route is cache-first (30-day TTL in the DB), so most calls return
 *   immediately without hitting the Google Places API.
 */
export function usePlaceDetails(placeIds: string[]): {
  details: Map<string, PlaceDetail>;
  loading: boolean;
} {
  const [details, setDetails] = useState<Map<string, PlaceDetail>>(new Map());
  const [loading, setLoading] = useState<boolean>(false);

  // Track which ids have already been fetched (or are in-flight) so we never
  // make duplicate requests across re-renders or StrictMode double-invocations.
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Unique ids that haven't been fetched yet
    const pending = [...new Set(placeIds)].filter(
      (id) => id && !fetchedRef.current.has(id)
    );

    if (pending.length === 0) return;

    // Mark all as fetched before the async calls start (prevents duplicates on re-render)
    pending.forEach((id) => fetchedRef.current.add(id));

    setLoading(true);

    const fetchOne = async (placeId: string): Promise<[string, PlaceDetail] | null> => {
      try {
        const res = await fetch(
          `/api/places/details?placeId=${encodeURIComponent(placeId)}`
        );
        if (!res.ok) return null;

        const data = await res.json() as {
          openingHours?: unknown;
          priceLevel?: number | null;
          hoursUnknown?: boolean;
        };

        return [
          placeId,
          {
            openingHours: data.openingHours ?? null,
            priceLevel: data.priceLevel ?? null,
            hoursUnknown: data.hoursUnknown ?? false,
          },
        ];
      } catch {
        // Per-id failure: tolerate and omit this id from the map
        return null;
      }
    };

    Promise.all(pending.map(fetchOne)).then((results) => {
      const newEntries = results.filter(
        (r): r is [string, PlaceDetail] => r !== null
      );

      if (newEntries.length > 0) {
        setDetails((prev) => {
          const next = new Map(prev);
          for (const [id, detail] of newEntries) {
            next.set(id, detail);
          }
          return next;
        });
      }

      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeIds.join(",")]);

  return { details, loading };
}
