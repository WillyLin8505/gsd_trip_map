/**
 * Client-side itinerary types for Phase 3 UI.
 *
 * Re-exports server types so UI components only need to import from here.
 * Also defines the two gap-join types documented in 03-CONTEXT.md:
 * - PlaceCoord: bridges the coordinate gap (OptimizeResult has no lat/lng)
 * - PlaceDetail: bridges the details gap (opening hours, price level)
 */

// Re-export shared types from their canonical locations
export type { OptimizeResult, ScheduledVisit } from '@/lib/optimizer/schedule';
export type { ResolvedPlace } from '@/lib/validation/resolve';

/**
 * Coordinate pair for a resolved place.
 *
 * Used to fill the coordinate gap: POST /api/optimize returns ScheduledVisit[]
 * with placeId + displayName but NO lat/lng. The UI maintains a
 * Map<placeId, PlaceCoord> built from the resolve step and uses it
 * to enrich visits before rendering Polyline + AdvancedMarker.
 *
 * @see 03-CONTEXT.md "Coordinate Gap (CRITICAL)"
 */
export interface PlaceCoord {
  lat: number;
  lng: number;
}

/**
 * Place detail fields fetched from /api/places/details.
 *
 * Used to fill the details gap in PlaceRow rendering.
 * hoursUnknown is carried from the optimizer response (ScheduledVisit.hoursUnknown)
 * but the raw periods and priceLevel come from the details API.
 *
 * openingHours is typed as unknown to avoid coupling the client to the server
 * schema — UI code should cast when needed.
 */
export interface PlaceDetail {
  openingHours: unknown;
  priceLevel: number | null;
  hoursUnknown: boolean;
}

/**
 * A visit enriched with both coordinate and detail data for map rendering.
 *
 * Built by joining ScheduledVisit (from optimize) + PlaceCoord (from resolve)
 * + PlaceDetail (from details, optional) in the UI state layer.
 */
export interface EnrichedVisit {
  placeId: string;
  displayName: string;
  scheduledStart: string;
  scheduledEnd: string;
  travelFromPrevMinutes: number;
  waitMinutes: number;
  hoursUnknown: boolean;
  warning?: string;
  lat: number;
  lng: number;
  priceLevel?: number | null;
}
