---
phase: 03-core-ui
plan: "04"
subsystem: map-view
tags: [map-view, map-view-wrapper, results-layout, disp-03, disp-04, coordinate-gap, ssr-false, use-callback, polyline, advanced-marker, info-window, mobile-tabs, responsive]
status: complete

dependency_graph:
  requires:
    - 03-01 (DAY_COLORS / getDayColor palette, shadcn/ui components: tabs, scroll-area)
    - 03-02 (ResultsLayout placeholder + resolvedPlaces prop contract, ItineraryView)
    - 03-03 (PlaceRow, usePlaceDetails, UnscheduledAlert; place-input-panel passes resolvedPlaces + detailsById)
    - Phase 1 (ResolvedPlace type with lat/lng from resolve route)
    - Phase 2 (ScheduledVisit.hoursUnknown from optimize route — no lat/lng in response)
  provides:
    - src/components/map-view.tsx (DISP-03: APIProvider + Map + per-day Polyline + numbered AdvancedMarker + InfoWindow + DayLegend)
    - src/components/map-view-wrapper.tsx (dynamic ssr:false gate — only import path for MapView)
    - src/components/results-layout.tsx (DISP-04: mobile Tabs / desktop flex split; coordinate gap join)
  affects:
    - src/components/results-layout.tsx (replaces 03-03 placeholder with full responsive layout)

tech_stack:
  added: []
  patterns:
    - "MapView: APIProvider + Map + Polyline per day (getDayColor, strokeWeight 4, strokeOpacity 0.85)"
    - "MarkerWithInfoWindow: useAdvancedMarkerRef + useCallback onClick (#404 infinite re-render prevention)"
    - "InfoWindow: anchor=marker, visit.hoursUnknown check independent of usePlaceDetails resolution"
    - "DayLegend: absolute positioned top-3 right-3, color pill per day"
    - "map-view-wrapper.tsx: dynamic ssr:false; loading fallback '地圖載入中...'"
    - "Key-missing guard: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY empty → gray placeholder '地圖暫時無法顯示'"
    - "buildDaysWithCoords: coordMap from resolvedPlaces placeId → {lat,lng}; ?? 0 fallback (T-03-12)"
    - "ResultsLayout mobile: md:hidden Tabs with h-11 (44px) triggers; map tab h-[calc(100vh-200px)]"
    - "ResultsLayout desktop: hidden md:flex, w-[420px] ScrollArea + flex-1 sticky MapView"

key_files:
  created:
    - src/components/map-view.tsx
    - src/components/map-view-wrapper.tsx
  modified:
    - src/components/results-layout.tsx

decisions:
  - "useCallback on ALL AdvancedMarker click handlers — mandatory to prevent #404 infinite re-render loop (confirmed github.com/visgl/react-google-maps/discussions/404)"
  - "hoursUnknown in InfoWindow sourced from visit directly (not only from detailsById Map) — ensures warning appears even if usePlaceDetails has not yet resolved"
  - "map-view-wrapper.tsx has NO 'use client' directive — it is a server component wrapping dynamic import; MapViewWrapper pattern ensures no SSR crash"
  - "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (exact name from .env.local) — not NEXT_PUBLIC_MAPS_KEY (03-CONTEXT.md disambiguation)"
  - "Coordinate gap join in ResultsLayout (not in PlaceInputPanel) — keeps PlaceInputPanel clean and ResultsLayout self-contained"
  - "DayLegend inline in map-view.tsx (not a separate file) — keeps all map-related JSX co-located; no cross-file coupling needed"

metrics:
  duration: "~15 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  commits: 2
---

# Phase 3 Plan 04: MapView + Responsive ResultsLayout Summary

**One-liner:** MapView with per-day colored polylines and numbered AdvancedMarkers (useCallback click handlers, InfoWindow with hoursUnknown warning), ssr:false wrapper, and responsive ResultsLayout (mobile Tabs / desktop flex) completing DISP-03 and DISP-04 with coordinate gap join from resolvedPlaces.

## What Was Built

### Task 1: MapView + MapViewWrapper (GREEN — was MODULE_NOT_FOUND)

**`src/components/map-view.tsx` (`'use client'`):**
- `MapView` props: `days: DayWithCoords[]` (each visit pre-enriched with lat/lng via coordinate join)
- `APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}` — exact env var name (not NEXT_PUBLIC_MAPS_KEY)
- `<Map mapId="itinerary-map" gestureHandling="greedy">` containing `MapContent`
- Per-day `<Polyline>` in `MapContent`: `getDayColor(dayIndex)`, `strokeWeight={4}`, `strokeOpacity={0.85}`, path as `{lat, lng}` (Pitfall 6 — not latitude/longitude)
- `MarkerWithInfoWindow` per visit: `useAdvancedMarkerRef()` + `useCallback` click handler (T-03-11, Pitfall 1)
- `InfoWindow` shows: displayName (JSX-escaped, T-03-10) + `scheduledStart – scheduledEnd` + amber `'營業時間未知，建議出發前確認'` when `visit.hoursUnknown` (SC4)
- `useMapsLibrary('core')` + `useMap()` to fit all marker bounds on first load (60px padding)
- `DayLegend` positioned `absolute top-3 right-3` with color pill per day ("第 N 天")
- Key-missing guard: if `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is falsy → gray div "地圖暫時無法顯示"

**`src/components/map-view-wrapper.tsx` (no 'use client' — server component):**
- `dynamic(() => import('./map-view').then(m => m.MapView), { ssr: false, loading: ... })`
- Loading fallback: gray div "地圖載入中..."
- Re-exports as `MapView` function so callers use identical import API
- This is the **only** import path for MapView — never import map-view.tsx directly (Pitfall 2)

**`map-view.test.tsx` turned GREEN:**
- Was: `Error: Cannot find module '/src/components/map-view'` (MODULE_NOT_FOUND RED)
- Now: 6 tests PASS:
  - `MapView` is defined and is a function
  - DAY_COLORS has 5 entries with correct hex values
  - getDayColor(0) returns blue; getDayColor(5) wraps to blue
  - Fixture has correct visit counts
  - Each visit in fixture has lat/lng coordinates (coordinate gap pre-filled)

### Task 2: Responsive ResultsLayout + coordinate join wiring

**`src/components/results-layout.tsx` (rewritten from 03-03 placeholder):**
- `buildDaysWithCoords(itinerary, resolvedPlaces)`: builds `coordMap = new Map(resolvedPlaces.map(...))`, then maps each day's visits to `{ ...visit, lat: coordMap.get(v.placeId)?.lat ?? 0, lng: ... ?? 0 }` (T-03-12)
- `MapView` imported from `./map-view-wrapper` (never directly from `./map-view`)
- Passes `daysWithCoords` from optimizeResult (not only from detailsById) so `visit.hoursUnknown` is available in InfoWindow immediately
- Mobile (`md:hidden`): `<Tabs>` with `TabsList`, `TabsTrigger` (h-11 = 44px) for `行程表` / `地圖`; map tab wraps MapView in `h-[calc(100vh-200px)]`
- Desktop (`hidden md:flex gap-6 items-start`): `w-[420px] flex-shrink-0` ScrollArea with ItineraryView + `flex-1 sticky top-4 min-h-[600px]` MapView
- Container: `w-full max-w-full` — no horizontal scroll at 375px
- `UnscheduledAlert` + `detailsById` threading preserved from 03-03
- `place-input-panel.tsx`: no changes needed — already passes `resolvedPlaces` and `detailsById` into `ResultsLayout`

## Verification State

| Check | Status |
|-------|--------|
| tsc --noEmit | CLEAN |
| map-view.test.tsx (6 tests) | 6 PASS — GREEN (was RED MODULE_NOT_FOUND) |
| Full vitest suite | 184 PASS (178 from 03-03 + 6 new map-view tests) |
| ssr: false in map-view-wrapper.tsx | OK |
| useCallback in map-view.tsx | OK |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in map-view.tsx | OK |
| '營業時間未知，建議出發前確認' in map-view.tsx (SC4) | OK |
| md:hidden in results-layout.tsx | OK |
| '行程表' tab in results-layout.tsx | OK |
| map-view-wrapper imported in results-layout.tsx | OK |
| w-[420px] in results-layout.tsx | OK |

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 3bb49a1 | feat | add MapView with polylines, markers, InfoWindow + MapViewWrapper ssr:false |
| befc385 | feat | responsive ResultsLayout with mobile Tabs / desktop flex split + MapView wiring |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Informational Notes

**1. [Informational] MapContent component extracted**
- The plan specified rendering Polylines and MarkerWithInfoWindow directly inside MapView. To correctly use `useMap()` and `useMapsLibrary('core')` (which require an ancestor `<Map>` component), a `MapContent` sub-component was extracted. This is the idiomatic @vis.gl/react-google-maps pattern.
- This does not affect behavior or test outcomes.

**2. [Informational] place-input-panel.tsx unchanged**
- The plan noted "Update place-input-panel.tsx only as needed". The 03-03 implementation already passes `resolvedPlaces` and `detailsById` into `ResultsLayout` — no changes were required.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `summarizeHours`: first period only | `src/components/place-row.tsx` | From 03-03; full per-day breakdown is Phase 5 |
| `loadingLabel` sequential cycling | `src/components/place-input-panel.tsx` | From 03-03; prop ready, cycling deferred to Phase 4 |

No new stubs introduced in 03-04.

## Threat Flags

No new security surfaces beyond the plan's threat model. All four registered threats mitigated:
- T-03-09 accepted: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in bundle is intentionally public; GCP HTTP-referrer restriction is the control
- T-03-10 mitigated: displayName rendered via React JSX (no dangerouslySetInnerHTML anywhere in map-view.tsx)
- T-03-11 mitigated: useCallback on handleClick and handleClose in MarkerWithInfoWindow (both handlers memoized)
- T-03-12 mitigated: `coordMap.get(visit.placeId)?.lat ?? 0` — optional chaining + nullish coalescing guards undefined access

## Self-Check: PASSED

- FOUND: src/components/map-view.tsx
- FOUND: src/components/map-view-wrapper.tsx
- FOUND: src/components/results-layout.tsx
- FOUND commit: 3bb49a1 (feat: MapView + MapViewWrapper)
- FOUND commit: befc385 (feat: responsive ResultsLayout)
- map-view.test.tsx: 6/6 PASS
- Full vitest suite: 184/184 PASS
- tsc --noEmit: CLEAN
