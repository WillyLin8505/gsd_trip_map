"use client";

/**
 * ResultsLayout — responsive container for itinerary + map results.
 *
 * DISP-04: Mobile (< md) shows a Tabs toggle (行程表 / 地圖); desktop (≥ md) shows
 * a side-by-side flex split: ItineraryView in a 420px ScrollArea (left) + MapView
 * sticky on the right.
 *
 * Coordinate gap (03-CONTEXT.md CRITICAL):
 * POST /api/optimize returns no lat/lng. ResultsLayout builds the coordMap from
 * resolvedPlaces and joins coordinates into each visit before passing to MapView.
 *
 * hoursUnknown in MapView InfoWindow (SC4):
 * visits are spread from optimizeResult directly (not just from detailsById) so
 * visit.hoursUnknown is available in MapView even before usePlaceDetails resolves.
 *
 * Mobile: no horizontal scroll; container is w-full max-w-full.
 * Touch targets: TabsTrigger h-11 (44px) per UI-SPEC section 9.
 *
 * T-03-12: coordMap.get() guarded by ?? 0 (undefined → fallback, no thrown access)
 */

import { ItineraryView } from "@/components/itinerary-view";
import { UnscheduledAlert } from "@/components/unscheduled-alert";
import { MapView } from "@/components/map-view-wrapper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OptimizeResult, PlaceDetail } from "@/types/itinerary";
import type { ResolvedPlace } from "@/lib/validation/resolve";

interface ResultsLayoutProps {
  itinerary: OptimizeResult;
  /** Resolved places with lat/lng — used to fill the coordinate gap for MapView */
  resolvedPlaces: ResolvedPlace[];
  /**
   * Per-place detail map from use-place-details.
   * Threaded to ItineraryView → DayCard → PlaceRow for rich row rendering.
   */
  detailsById?: Map<string, PlaceDetail>;
}

/**
 * Build the coordinate-joined daysWithCoords from the optimize result + resolvedPlaces.
 *
 * Coordinate gap: ScheduledVisit has placeId but no lat/lng.
 * coordMap keys by placeId → { lat, lng } from the resolve step.
 * Missing placeId falls back to { lat: 0, lng: 0 } (T-03-12 guarded with ?? 0).
 */
function buildDaysWithCoords(
  itinerary: OptimizeResult,
  resolvedPlaces: ResolvedPlace[]
) {
  const coordMap = new Map(
    resolvedPlaces.map((p) => [p.placeId, { lat: p.lat, lng: p.lng }])
  );

  return itinerary.days.map((day) => ({
    dayNumber: day.dayNumber,
    visits: day.visits.map((visit) => ({
      ...visit,
      lat: coordMap.get(visit.placeId)?.lat ?? 0,
      lng: coordMap.get(visit.placeId)?.lng ?? 0,
    })),
  }));
}

export function ResultsLayout({
  itinerary,
  resolvedPlaces,
  detailsById,
}: ResultsLayoutProps) {
  // Build coordinate-joined days for MapView (coordinate gap join)
  const daysWithCoords = buildDaysWithCoords(itinerary, resolvedPlaces);

  return (
    <div className="w-full max-w-full space-y-4">
      {/* Unscheduled places alert — always surface, never silently hide */}
      {itinerary.unscheduled.length > 0 && (
        <UnscheduledAlert
          unscheduled={itinerary.unscheduled}
          resolvedPlaces={resolvedPlaces}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mobile layout (< md): shadcn Tabs toggle                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="md:hidden">
        <Tabs defaultValue="itinerary">
          <TabsList className="w-full">
            {/* h-11 = 44px touch target per UI-SPEC section 9 */}
            <TabsTrigger value="itinerary" className="flex-1 h-11">
              行程表
            </TabsTrigger>
            <TabsTrigger value="map" className="flex-1 h-11">
              地圖
            </TabsTrigger>
          </TabsList>

          <TabsContent value="itinerary">
            <ItineraryView itinerary={itinerary} detailsById={detailsById} />
          </TabsContent>

          <TabsContent value="map">
            <div className="h-[calc(100vh-200px)]">
              {/* MapView receives visits from optimizeResult directly so
                  hoursUnknown is available even before usePlaceDetails resolves */}
              <MapView days={daysWithCoords} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Desktop layout (≥ md): side-by-side flex split                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden md:flex gap-6 items-start">
        {/* Itinerary panel: fixed 420px width, scrollable */}
        <div className="w-[420px] flex-shrink-0">
          <ScrollArea className="h-[calc(100vh-160px)]">
            <ItineraryView itinerary={itinerary} detailsById={detailsById} />
          </ScrollArea>
        </div>

        {/* Map panel: fills remaining space, sticky beside scrolling itinerary */}
        <div className="flex-1 sticky top-4 min-h-[600px] h-[calc(100vh-160px)]">
          <MapView days={daysWithCoords} />
        </div>
      </div>
    </div>
  );
}
