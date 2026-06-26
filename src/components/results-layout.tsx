"use client";

import { ItineraryView } from "@/components/itinerary-view";
import { UnscheduledAlert } from "@/components/unscheduled-alert";
import type { OptimizeResult, PlaceDetail } from "@/types/itinerary";
import type { ResolvedPlace } from "@/lib/validation/resolve";

interface ResultsLayoutProps {
  itinerary: OptimizeResult;
  /** Resolved places with lat/lng — passed through for 03-04 MapView coordinate join */
  resolvedPlaces: ResolvedPlace[];
  /**
   * Per-place detail map from use-place-details.
   * Threaded to ItineraryView → DayCard → PlaceRow for rich row rendering.
   */
  detailsById?: Map<string, PlaceDetail>;
}

/**
 * ResultsLayout — stacked results container.
 *
 * Renders: ItineraryView (with detailsById for DISP-02) + UnscheduledAlert
 * + map placeholder (03-04 replaces with responsive Tabs/flex layout + MapView).
 *
 * DISP-02: threads detailsById to ItineraryView.
 * Unscheduled places: always surfaced via UnscheduledAlert (never silently hidden).
 */
export function ResultsLayout({
  itinerary,
  resolvedPlaces,
  detailsById,
}: ResultsLayoutProps) {
  return (
    <div className="space-y-6">
      <ItineraryView itinerary={itinerary} detailsById={detailsById} />

      {/* Unscheduled places alert — never hide these */}
      {itinerary.unscheduled.length > 0 && (
        <UnscheduledAlert
          unscheduled={itinerary.unscheduled}
          resolvedPlaces={resolvedPlaces}
        />
      )}

      {/* Map slot — placeholder for 03-04 */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 h-64 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">地圖即將顯示</p>
      </div>
    </div>
  );
}
