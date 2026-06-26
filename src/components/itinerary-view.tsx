"use client";

import { DayCard } from "@/components/day-card";
import type { OptimizeResult } from "@/types/itinerary";

interface ItineraryViewProps {
  itinerary: OptimizeResult;
  /**
   * Optional per-place detail map keyed by placeId.
   * 03-03 will use this to pass opening hours, price level, etc.
   * Leave as optional so this component does not block on 03-03 data.
   */
  coordHoursById?: Record<string, unknown>;
}

/**
 * ItineraryView — renders a list of DayCards for a complete OptimizeResult.
 *
 * DISP-01: Day headings "第 N 天" and ordered visit rows with time slots.
 *
 * AUTH-01: No auth imports.
 */
export function ItineraryView({ itinerary }: ItineraryViewProps) {
  return (
    <div className="space-y-4">
      {itinerary.days.map((day) => (
        <DayCard key={day.dayNumber} day={day} />
      ))}
    </div>
  );
}
