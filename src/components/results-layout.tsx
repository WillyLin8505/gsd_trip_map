"use client";

import { ItineraryView } from "@/components/itinerary-view";
import type { OptimizeResult } from "@/types/itinerary";
import type { ResolvedPlace } from "@/lib/validation/resolve";

interface ResultsLayoutProps {
  itinerary: OptimizeResult;
  /** Resolved places with lat/lng — passed through for 03-04 MapView coordinate join */
  resolvedPlaces: ResolvedPlace[];
}

/**
 * ResultsLayout — stacked results container.
 *
 * For 03-02: single-column layout with ItineraryView + map placeholder.
 * 03-04 replaces the placeholder div with the responsive Tabs/flex layout + MapView.
 *
 * Accepts and forwards resolvedPlaces so 03-04 can build the coordinate map
 * without changing this component's prop signature.
 */
export function ResultsLayout({ itinerary, resolvedPlaces: _resolvedPlaces }: ResultsLayoutProps) {
  return (
    <div className="space-y-6">
      <ItineraryView itinerary={itinerary} />

      {/* Map slot — placeholder for 03-04 */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 h-64 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">地圖即將顯示</p>
      </div>
    </div>
  );
}
