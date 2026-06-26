"use client";

/**
 * DayPlaceAdder — F1 "add place" widget for the results page.
 *
 * Flow:
 *   1. User pastes a place name or Google Maps link into the Input.
 *   2. On "加入行程" click:
 *      a. POST /api/places/resolve (city-conditional — Pitfall 7: never city:"")
 *      b. Check first result for NOT_FOUND → show "找不到這個地點"
 *      c. pickClosestDay(newPlace, daysWithCoords) → dayNumber
 *      d. POST /api/optimize/day { placeIds:[...thatDay, newId], reorder:false, dayNumber }
 *      e. replaceDay(dayNumber, day) + merge new coords into resolvedPlaces
 *      f. Clear input
 *   3. Any failure: show inline Alert; NEVER wipe optimizeResult (error handling contract).
 *
 * Pitfall 7: city must be omitted (not sent as "") when resolvedCity is null.
 * Pitfall 5: replaceDay is a functional updater — only swaps one day, preserves suggestedDays.
 *
 * AUTH-01: No auth imports; all calls are anonymous.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { pickClosestDay } from "@/lib/places/closest-day";
import type { ResolvedPlace } from "@/lib/validation/resolve";
import type { OptimizeResult, ScheduledVisit } from "@/types/itinerary";

interface DayPlaceAdderProps {
  /**
   * The resolved city name used for location bias on /api/places/resolve.
   * null → omit city from the resolve body (Pitfall 7).
   */
  resolvedCity: string | null;
  /**
   * ISO date string for the travel's start date (YYYY-MM-DD or "").
   * Forwarded to /api/optimize/day as travelDate when non-empty.
   */
  startDate: string;
  /**
   * The current full optimize result — used to extract each day's placeIds
   * (for the append-and-reschedule call) and build daysWithCoords for pickClosestDay.
   */
  optimizeResult: OptimizeResult;
  /**
   * Resolved places with lat/lng — used to build daysWithCoords for pickClosestDay.
   */
  resolvedPlaces: ResolvedPlace[];
  /**
   * Swap one day in the itinerary (functional updater — preserves suggestedDays).
   */
  replaceDay: (
    dayNumber: number,
    newDay: { dayNumber: number; visits: ScheduledVisit[] }
  ) => void;
  /**
   * Merge the new place's coords into the coord-map so the map marker renders.
   */
  setResolvedPlaces: React.Dispatch<React.SetStateAction<ResolvedPlace[]>>;
}

export function DayPlaceAdder({
  resolvedCity,
  startDate,
  optimizeResult,
  resolvedPlaces,
  replaceDay,
  setResolvedPlaces,
}: DayPlaceAdderProps) {
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const text = inputValue.trim();
    if (!text) return;

    setError(null);
    setLoading(true);

    try {
      // Step 1: Resolve the pasted text
      // NEVER send city:"" — Pitfall 7: resolveRequestSchema rejects empty strings
      const resolveBody = resolvedCity
        ? { inputs: [text], city: resolvedCity }
        : { inputs: [text] };

      let resolveRes: Response;
      try {
        resolveRes = await fetch("/api/places/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resolveBody),
        });
      } catch {
        setError("加入地點失敗，請稍後再試");
        return;
      }

      if (!resolveRes.ok) {
        const data = (await resolveRes.json()) as { error?: string };
        setError(data.error ?? "加入地點失敗，請稍後再試");
        return;
      }

      const resolveData = (await resolveRes.json()) as {
        places: Array<
          | ResolvedPlace
          | { status: "NOT_FOUND"; original_query: string }
        >;
      };

      // Check for NOT_FOUND — first item has "status" in it
      const firstItem = resolveData.places?.[0];
      if (!firstItem || "status" in firstItem) {
        setError("找不到這個地點");
        // Keep input value so user can edit; keep itinerary intact
        return;
      }

      const newPlace: ResolvedPlace = firstItem;

      // Step 2: Build daysWithCoords for pickClosestDay (same as buildDaysWithCoords in results-layout)
      const coordMap = new Map(
        resolvedPlaces.map((p) => [p.placeId, { lat: p.lat, lng: p.lng }])
      );

      const daysWithCoords = optimizeResult.days.map((day) => ({
        dayNumber: day.dayNumber,
        visits: day.visits
          .map((v) => coordMap.get(v.placeId))
          .filter((c): c is { lat: number; lng: number } => c !== undefined),
      }));

      // Step 3: Pick the closest day
      const dayNumber = pickClosestDay(
        { lat: newPlace.lat, lng: newPlace.lng },
        daysWithCoords
      );

      // Step 4: Get the target day's existing placeIds + append new one
      const targetDay = optimizeResult.days.find((d) => d.dayNumber === dayNumber);
      const existingPlaceIds = targetDay?.visits.map((v) => v.placeId) ?? [];
      const placeIds = [...existingPlaceIds, newPlace.placeId];

      // Step 5: POST /api/optimize/day (reorder=false — keep existing order, just re-time)
      const dayBody: Record<string, unknown> = {
        placeIds,
        reorder: false,
        dayNumber,
      };
      if (startDate) {
        dayBody.travelDate = startDate;
      }

      let dayRes: Response;
      try {
        dayRes = await fetch("/api/optimize/day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dayBody),
        });
      } catch {
        setError("加入地點失敗，請稍後再試");
        return;
      }

      if (!dayRes.ok) {
        setError("加入地點失敗，請稍後再試");
        // NEVER wipe itinerary on failure (error handling contract)
        return;
      }

      const { day, unscheduled } = (await dayRes.json()) as {
        day: { dayNumber: number; visits: ScheduledVisit[] };
        unscheduled: Array<{ placeId: string; reason: string }>;
      };

      // CR-01: If the newly-added place was rejected (e.g. closed on this day),
      // inform the user and do NOT update the itinerary or clear the input.
      // The user must never lose a place silently.
      if (unscheduled.some((u) => u.placeId === newPlace.placeId)) {
        const reason =
          unscheduled.find((u) => u.placeId === newPlace.placeId)?.reason ?? "";
        setError(`「${newPlace.displayName}」在該天無法安排（${reason}）`);
        return; // keep input value; itinerary unchanged
      }

      // Step 6: Update state — swap day + merge new place coords
      replaceDay(dayNumber, day);
      setResolvedPlaces((prev) => [...prev, newPlace]);
      setInputValue(""); // clear on success
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="貼上地點名稱或 Google Maps 連結"
          aria-label="新增地點"
          disabled={loading}
          className="flex-1 h-11"
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim() && !loading) {
              void handleAdd();
            }
          }}
        />
        <Button
          onClick={() => void handleAdd()}
          disabled={!inputValue.trim() || loading}
          aria-busy={loading}
          className="h-11 shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加入中...
            </>
          ) : (
            "加入行程"
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
