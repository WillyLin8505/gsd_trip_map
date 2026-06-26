'use client';

/**
 * MapView — interactive map with per-day colored polylines and numbered AdvancedMarkers.
 *
 * DISP-03:
 * - One Polyline per day, strokeColor = getDayColor(dayIndex), strokeWeight 4, strokeOpacity 0.85
 * - One AdvancedMarker per visit: circular day-color badge with within-day visit number
 * - Click marker → InfoWindow: displayName + time slot + hoursUnknown amber warning
 * - DayLegend: absolute top-3 right-3, color pill per day ("第 N 天")
 *
 * Critical pitfalls avoided:
 * - Pitfall 1: useCallback on ALL AdvancedMarker click handlers (#404 infinite re-render)
 * - Pitfall 2: this file is ONLY imported via map-view-wrapper.tsx (ssr: false)
 * - Pitfall 6: Polyline path uses { lat, lng } not { latitude, longitude }
 * - Pitfall 7: visits already carry lat/lng — filled by coordinate join in ResultsLayout
 *
 * T-03-10: displayName rendered via JSX (never dangerouslySetInnerHTML)
 * T-03-11: useCallback prevents CPU DoS from infinite re-render
 * T-03-12: coordMap.get() guarded by ?? 0
 */

import {
  APIProvider,
  Map,
  AdvancedMarker,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
  InfoWindow,
  Polyline,
} from '@vis.gl/react-google-maps';
import { useEffect, useState, useCallback } from 'react';
import { getDayColor } from '@/lib/map/day-colors';
import type { ScheduledVisit } from '@/lib/optimizer/schedule';
import type { PlaceCoord } from '@/types/itinerary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A visit enriched with lat/lng from the coordinate join in ResultsLayout */
export type VisitWithCoord = ScheduledVisit & PlaceCoord;

export interface DayWithCoords {
  dayNumber: number;
  visits: VisitWithCoord[];
}

export interface MapViewProps {
  days: DayWithCoords[];
}

// ---------------------------------------------------------------------------
// MarkerWithInfoWindow — single visit marker + click-to-open InfoWindow
// ---------------------------------------------------------------------------

interface MarkerProps {
  visit: VisitWithCoord;
  dayIndex: number;
  visitIndex: number;
  color: string;
}

function MarkerWithInfoWindow({ visit, dayIndex, visitIndex, color }: MarkerProps) {
  const [open, setOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // CRITICAL: memoize click handler to prevent #404 infinite re-render loop.
  // github.com/visgl/react-google-maps/discussions/404
  const handleClick = useCallback(() => setOpen((o) => !o), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: visit.lat, lng: visit.lng }}
        onClick={handleClick}
        aria-label={`${visit.displayName} — 第${dayIndex + 1}天 第${visitIndex}站`}
      >
        {/* Circular day-colored badge with visit order number */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: color,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
            border: '2px solid white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
        >
          {visitIndex}
        </div>
      </AdvancedMarker>

      {open && (
        <InfoWindow anchor={marker} onClose={handleClose}>
          {/* T-03-10: JSX auto-escapes displayName — no dangerouslySetInnerHTML */}
          <div style={{ minWidth: 160, padding: '2px 0' }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px', fontSize: 14 }}>
              {visit.displayName}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>
              {visit.scheduledStart} – {visit.scheduledEnd}
            </p>
            {/* hoursUnknown warning — SC4: must appear in BOTH itinerary row AND map InfoWindow */}
            {visit.hoursUnknown && (
              <p style={{ color: '#b45309', fontSize: 12, margin: 0 }}>
                營業時間未知，建議出發前確認
              </p>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DayLegend — absolute top-3 right-3, one color pill per day
// ---------------------------------------------------------------------------

function DayLegend({ days }: { days: DayWithCoords[] }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        background: 'rgba(255,255,255,0.92)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 200,
        overflowY: 'auto',
      }}
    >
      {days.map((day, idx) => {
        const color = getDayColor(idx);
        return (
          <div key={day.dayNumber} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: '#333', whiteSpace: 'nowrap' }}>
              第 {day.dayNumber} 天
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MapContent — rendered inside APIProvider, uses map hooks
// ---------------------------------------------------------------------------

function MapContent({ days }: MapViewProps) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  // Fit all markers into view on first load
  useEffect(() => {
    if (!map || !coreLib) return;
    const allCoords = days.flatMap((d) => d.visits);
    if (allCoords.length === 0) return;
    const bounds = new coreLib.LatLngBounds();
    allCoords.forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));
    map.fitBounds(bounds, 60); // 60px padding
  }, [map, coreLib, days]);

  return (
    <>
      {/* Per-day Polylines */}
      {days.map((day, dayIndex) => {
        const color = getDayColor(dayIndex);
        // Pitfall 6: use { lat, lng } — NOT { latitude, longitude }
        const path = day.visits.map((v) => ({ lat: v.lat, lng: v.lng }));
        return (
          <Polyline
            key={`polyline-day-${day.dayNumber}`}
            path={path}
            strokeColor={color}
            strokeWeight={4}
            strokeOpacity={0.85}
          />
        );
      })}

      {/* Per-visit AdvancedMarkers */}
      {days.flatMap((day, dayIndex) => {
        const color = getDayColor(dayIndex);
        return day.visits.map((visit, visitIdx) => (
          <MarkerWithInfoWindow
            key={`marker-${day.dayNumber}-${visitIdx}`}
            visit={visit}
            dayIndex={dayIndex}
            visitIndex={visitIdx + 1}
            color={color}
          />
        ));
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// MapView — exported component (only via map-view-wrapper.tsx ssr:false)
// ---------------------------------------------------------------------------

export function MapView({ days }: MapViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Key-missing path: show gray placeholder instead of map (UI-SPEC States table)
  if (!apiKey) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: 300,
          background: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
        }}
      >
        <p style={{ color: '#9ca3af', fontSize: 14 }}>地圖暫時無法顯示</p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={{ lat: 23.6978, lng: 120.9605 }}
          defaultZoom={10}
          gestureHandling="greedy"
          mapId="itinerary-map"
        >
          <MapContent days={days} />
        </Map>

        {/* DayLegend: absolute top-3 right-3 */}
        {days.length > 0 && <DayLegend days={days} />}
      </div>
    </APIProvider>
  );
}
