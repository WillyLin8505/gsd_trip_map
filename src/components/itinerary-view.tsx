"use client";

import { DayCard } from "@/components/day-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { OptimizeResult, PlaceDetail } from "@/types/itinerary";

interface ItineraryViewProps {
  itinerary: OptimizeResult;
  /**
   * Per-place detail map keyed by placeId — from use-place-details.
   * Passed through to DayCard → PlaceRow for hours/price/hoursUnknown rendering.
   * Optional: rows degrade gracefully (only optimizer hoursUnknown flag used).
   */
  detailsById?: Map<string, PlaceDetail>;
  /** INPUT-05: forwarded to DayCard → PlaceRow to enable inline duration editing */
  onDurationChange?: (placeId: string, minutes: number) => void;
}

/**
 * ItineraryView — renders a list of DayCards for a complete OptimizeResult.
 *
 * DISP-01: Day headings "第 N 天" and ordered visit rows with time slots.
 * DISP-02: Passes detailsById to DayCard for rich PlaceRow rendering.
 *
 * Global hoursUnknown alert (UI-SPEC States table):
 * When every scheduled visit in every day has hoursUnknown=true, shows an
 * amber Alert above the DayCards: "所有地點的營業時間未知，建議出發前逐一確認".
 *
 * AUTH-01: No auth imports.
 */
export function ItineraryView({ itinerary, detailsById, onDurationChange }: ItineraryViewProps) {
  // Check if ALL scheduled visits have hoursUnknown=true (using optimizer flag)
  const allVisits = itinerary.days.flatMap((d) => d.visits);
  const allHoursUnknown =
    allVisits.length > 0 && allVisits.every((v) => v.hoursUnknown);

  return (
    <div className="space-y-4">
      {/* Global hoursUnknown warning — shown when every visit is unknown */}
      {allHoursUnknown && (
        <Alert
          role="alert"
          className="bg-amber-50 text-amber-700 border-amber-200"
        >
          <AlertDescription>
            所有地點的營業時間未知，建議出發前逐一確認
          </AlertDescription>
        </Alert>
      )}

      {itinerary.days.map((day) => (
        <DayCard
          key={day.dayNumber}
          day={day}
          detailsById={detailsById}
          onDurationChange={onDurationChange}
        />
      ))}
    </div>
  );
}
