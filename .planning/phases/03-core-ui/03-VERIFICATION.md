---
phase: 03-core-ui
verified: 2026-06-26T14:25:00Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 2
overrides_applied: 0
human_verification:
  - test: "Navigate to the app in a browser at 375px viewport width, paste Chinese place names, click 查詢地點, then 最佳化行程, and verify the layout has no horizontal scroll and that the mobile Tabs toggle (行程表 / 地圖) works correctly"
    expected: "No horizontal scrollbar at 375px; Tabs toggling shows itinerary or map panel correctly; all text is readable without clipping"
    why_human: "CSS responsive breakpoint behavior (md:hidden / hidden md:flex) and scroll behavior cannot be verified by grep or test runner — requires a browser viewport at 375px"
  - test: "With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set, open the results page after optimizing and click a map marker"
    expected: "InfoWindow opens showing place name, time slot, and (where hoursUnknown) the amber warning '營業時間未知，建議出發前確認'; closing and re-opening works without infinite re-render"
    why_human: "Google Maps runtime behavior (AdvancedMarker click, InfoWindow anchor, useCallback re-render guard) requires a browser with a live Maps API key — cannot be exercised in the node vitest environment"
behavior_unverified_items:
  - truth: "At 375px the full flow has no horizontal scroll; itinerary/map use a Tabs toggle on mobile and a side-by-side flex split on desktop (DISP-04)"
    test: "Open the app in a browser at 375px viewport, complete the full paste-to-itinerary flow"
    expected: "No horizontal scroll bar appears; mobile Tabs toggle between 行程表 and 地圖 panels; desktop shows side-by-side 420px / flex-1 layout"
    why_human: "CSS responsive layout and scroll containment at a specific viewport width require a browser — the vitest node environment has no DOM or viewport"
  - truth: "Clicking a marker opens an InfoWindow showing the place name, time slot, and (when hoursUnknown) the amber warning (SC4 map side)"
    test: "Open the app with a live Google Maps API key, trigger an itinerary, and click an AdvancedMarker on the map"
    expected: "InfoWindow opens with correct content; hoursUnknown warning appears when visit.hoursUnknown is true; no infinite re-render on repeated clicks"
    why_human: "Google Maps runtime interaction (APIProvider, AdvancedMarker, InfoWindow, useCallback correctness) cannot be exercised in the node test environment"
---

# Phase 3: Core UI — Verification Report

**Phase Goal:** An anonymous user can paste a list of places, see them resolved and confirmed, click "最佳化行程", and receive a day-by-day itinerary table and interactive map — all without creating an account.
**Verified:** 2026-06-26T14:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Anonymous user can paste Chinese place names + a city, click 查詢地點, and see each resolved place with its address — no login required | ✓ VERIFIED | `place-input-panel.tsx` POSTs to `/api/places/resolve` (line 81); no supabase/auth imports anywhere in the component tree; `place-input-panel.test.tsx` 7/7 pass |
| 2 | From the confirmed list the user clicks 最佳化行程 and receives a day-by-day itinerary rendered as 第 N 天 cards with ordered place rows showing arrival–departure times | ✓ VERIFIED | `place-input-panel.tsx` POSTs to `/api/optimize` (line 129); `day-card.tsx` renders "第 {dayNumber} 天" with PlaceRow list; `itinerary-view.test.tsx` 4/4 pass |
| 3 | Each itinerary place row shows its opening hours and price level fetched from GET /api/places/details (DISP-02) | ✓ VERIFIED | `place-row.tsx` renders `hoursSummary`, `priceStr`, and amber badge; `use-place-details.ts` fetches `/api/places/details?placeId=X`; `place-row.test.tsx` 4/4 pass |
| 4 | A place with hoursUnknown=true shows the amber badge "營業時間未知，建議出發前確認" in the itinerary row | ✓ VERIFIED | `place-row.tsx` line 146 renders exact copy with `bg-amber-50 text-amber-700 border-amber-200`; `place-row.test.tsx` passes |
| 5 | Places that /api/optimize could not schedule appear in an UnscheduledAlert with their reasons — never silently dropped | ✓ VERIFIED | `unscheduled-alert.tsx` renders `Alert variant="destructive"` with "以下地點無法排入行程" title; `results-layout.tsx` conditionally renders it when `itinerary.unscheduled.length > 0`; early-returns null only when list is empty |
| 6 | The map renders one colored polyline per day and numbered markers per visit, each day in its own color (DISP-03) | ✓ VERIFIED | `map-view.tsx` renders `<Polyline>` per day with `getDayColor(dayIndex)`, strokeWeight=4, strokeOpacity=0.85; `<AdvancedMarker>` per visit with within-day number; `map-view.test.tsx` 6/6 pass |
| 7 | Marker coordinates are joined from resolvedPlaces by placeId, because /api/optimize returns no lat/lng (coordinate gap) | ✓ VERIFIED | `results-layout.tsx` `buildDaysWithCoords()` builds `coordMap` from `resolvedPlaces`, joins `lat`/`lng` per visit via `coordMap.get(visit.placeId)?.lat ?? 0` |
| 8 | The full input -> resolve -> optimize -> view flow runs with zero auth checks (AUTH-01) | ✓ VERIFIED | `grep` found no supabase/auth/session imports in `place-input-panel.tsx`, `results-layout.tsx`, `itinerary-view.tsx`, `day-card.tsx`, `map-view.tsx`; `page.tsx` has no auth gate |
| 9 | Clicking a marker opens an InfoWindow showing the place name, time slot, and (when hoursUnknown) the amber warning (SC4 map side) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `map-view.tsx` line 115 conditionally renders "營業時間未知，建議出發前確認" in InfoWindow when `visit.hoursUnknown`; `useCallback` on click handler present (lines 71–72); runtime Google Maps interaction requires browser |
| 10 | At 375px the full flow has no horizontal scroll; itinerary/map use a Tabs toggle on mobile and a side-by-side flex split on desktop (DISP-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `results-layout.tsx` uses `md:hidden` Tabs with `h-11` triggers and `hidden md:flex` desktop split; container is `w-full max-w-full`; actual scroll behavior requires browser viewport |

**Score:** 8/10 truths verified (2 present, behavior-unverified — both require browser/runtime)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components.json` | shadcn config | ✓ VERIFIED | File exists |
| `src/components/ui/button.tsx` | shadcn Button | ✓ VERIFIED | File exists |
| `src/components/ui/input.tsx` | shadcn Input | ✓ VERIFIED | File exists |
| `src/components/ui/textarea.tsx` | shadcn Textarea | ✓ VERIFIED | File exists |
| `src/components/ui/card.tsx` | shadcn Card | ✓ VERIFIED | File exists |
| `src/components/ui/badge.tsx` | shadcn Badge | ✓ VERIFIED | File exists |
| `src/components/ui/separator.tsx` | shadcn Separator | ✓ VERIFIED | File exists |
| `src/components/ui/scroll-area.tsx` | shadcn ScrollArea | ✓ VERIFIED | File exists |
| `src/components/ui/tabs.tsx` | shadcn Tabs | ✓ VERIFIED | File exists |
| `src/components/ui/skeleton.tsx` | shadcn Skeleton | ✓ VERIFIED | File exists |
| `src/components/ui/alert.tsx` | shadcn Alert | ✓ VERIFIED | File exists |
| `src/components/ui/tooltip.tsx` | shadcn Tooltip | ✓ VERIFIED | File exists |
| `src/providers/query-provider.tsx` | TanStack Query singleton | ✓ VERIFIED | Exists; imports QueryClientProvider; `query-provider.test.tsx` 2/2 pass |
| `src/lib/map/day-colors.ts` | DAY_COLORS + getDayColor() | ✓ VERIFIED | `DAY_COLORS = ['#2563EB','#16A34A','#D97706','#9333EA','#DC2626'] as const`; modulo wrap in getDayColor |
| `src/types/itinerary.ts` | ResolvedPlace, OptimizeResult re-exports + PlaceCoord | ✓ VERIFIED | Re-exports from canonical locations; defines PlaceCoord, PlaceDetail, EnrichedVisit |
| `src/components/place-input-panel.tsx` | 3-step flow controller | ✓ VERIFIED | Substantive; manages state, POSTs to resolve + optimize, renders all 3 flow steps |
| `src/components/resolved-place-list.tsx` | Confirmation list | ✓ VERIFIED | Renders confirmation Alert + place Cards with remove buttons |
| `src/components/itinerary-view.tsx` | Day-by-day itinerary | ✓ VERIFIED | Renders DayCard list; global hoursUnknown alert; detailsById threading |
| `src/components/day-card.tsx` | 第 N 天 header + PlaceRow list | ✓ VERIFIED | Renders "第 {dayNumber} 天"; uses `<PlaceRow>` with detailsById |
| `src/components/results-layout.tsx` | Responsive container | ✓ VERIFIED | Mobile Tabs + desktop flex split; coordinate gap join; UnscheduledAlert; MapView via wrapper |
| `src/components/place-row.tsx` | Rich row with hours/price/badge | ✓ VERIFIED | Renders hours, price, travel time, amber hoursUnknown badge; `place-row.test.tsx` 4/4 pass |
| `src/lib/places/use-place-details.ts` | Details fetch hook | ✓ VERIFIED | useRef Set-based dedup; returns `Map<string, PlaceDetail>`; per-id failure tolerance |
| `src/components/unscheduled-alert.tsx` | Non-scheduled places | ✓ VERIFIED | Alert variant="destructive"; title "以下地點無法排入行程"; bulleted list with reason |
| `src/components/progress-steps.tsx` | 3-step indicator | ✓ VERIFIED | STEPS const tuple; aria-live="polite"; aria-current="step"; correct color logic |
| `src/components/map-view.tsx` | Google Maps with polylines + markers | ✓ VERIFIED | APIProvider + Polyline per day + AdvancedMarker per visit + InfoWindow + DayLegend; useCallback on handlers; ssr:false via wrapper |
| `src/components/map-view-wrapper.tsx` | dynamic ssr:false import | ✓ VERIFIED | `dynamic(import('./map-view'), { ssr: false })`; loading fallback present |
| `src/lib/google/places-client.ts` | buildCityBias() city lookup | ✓ VERIFIED | 24-entry TAIWAN_CITY_COORDS; 高雄市 → 22.6273/120.3014; 100km fallback for unknowns |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `layout.tsx` | `{children}` | `<ThemeProvider><QueryProvider>` | ✓ WIRED | Lines 34–38; both providers confirmed in `grep` output |
| `page.tsx` | `PlaceInputPanel` | direct import + render | ✓ WIRED | page.tsx line 1 imports; line 14 renders `<PlaceInputPanel />` |
| `PlaceInputPanel` | `/api/places/resolve` | `fetch()` POST | ✓ WIRED | line 81; response stored in `resolvedPlaces` state |
| `PlaceInputPanel` | `/api/optimize` | `fetch()` POST with placeIds | ✓ WIRED | line 129; response stored in `optimizeResult` state |
| `PlaceInputPanel` | `usePlaceDetails` | call after optimize | ✓ WIRED | line 45; `scheduledPlaceIds` derived from `optimizeResult.days` |
| `PlaceInputPanel` | `ResultsLayout` | pass `itinerary + resolvedPlaces + detailsById` | ✓ WIRED | lines 175–179 |
| `ResultsLayout` | `MapViewWrapper` | import from `./map-view-wrapper` (not directly from `./map-view`) | ✓ WIRED | line 26 |
| `ResultsLayout` | coordinate join | `buildDaysWithCoords(itinerary, resolvedPlaces)` | ✓ WIRED | lines 50–66; feeds `daysWithCoords` to MapView |
| `DayCard` | `PlaceRow` | per-visit with `detail={detailsById?.get(visit.placeId)}` | ✓ WIRED | day-card.tsx line 5 import; line 48 render |
| `resolve/route.ts` | `buildCityBias()` in places-client.ts | call when no explicit locationBias | ✓ WIRED | `places-client.ts` textSearch() calls `buildCityBias(city)` at line 80 |
| `ItineraryView` | global hoursUnknown Alert | `allVisits.every(v => v.hoursUnknown)` check | ✓ WIRED | itinerary-view.tsx lines 30–44 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `PlaceInputPanel` | `resolvedPlaces` | `fetch("/api/places/resolve")` response | Yes — API calls Google Places, upserts to DB | ✓ FLOWING |
| `PlaceInputPanel` | `optimizeResult` | `fetch("/api/optimize")` response | Yes — Phase 2 scheduler produces `days[]` + `unscheduled[]` | ✓ FLOWING |
| `PlaceRow` | `detail` | `usePlaceDetails` → `GET /api/places/details?placeId=X` | Yes — fetches from Phase 1 DB cache or Google | ✓ FLOWING |
| `MapView` (via ResultsLayout) | `daysWithCoords` | `buildDaysWithCoords(optimizeResult, resolvedPlaces)` | Yes — joins visits from real optimize response with real lat/lng from resolve | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| itinerary-view.test.tsx (DISP-01) | `npx vitest run src/components/itinerary-view.test.tsx` | 4/4 pass | ✓ PASS |
| place-row.test.tsx (DISP-02) | `npx vitest run src/components/place-row.test.tsx` | 4/4 pass | ✓ PASS |
| map-view.test.tsx (DISP-03) | `npx vitest run src/components/map-view.test.tsx` | 6/6 pass | ✓ PASS |
| query-provider.test.tsx | `npx vitest run src/providers/query-provider.test.tsx` | 2/2 pass | ✓ PASS |
| place-input-panel.test.tsx (E2E) | `npx vitest run src/components/place-input-panel.test.tsx` | 7/7 pass | ✓ PASS |
| Full suite | `npx vitest run` | 184/184 pass | ✓ PASS |
| hoursUnknown amber copy in both surfaces | `grep "營業時間未知，建議出發前確認" place-row.tsx map-view.tsx` | Found in both files (line 146, line 117) | ✓ PASS |
| ssr: false in map-view-wrapper.tsx | `grep "ssr: false" map-view-wrapper.tsx` | line 21 | ✓ PASS |
| useCallback on marker click | `grep "useCallback" map-view.tsx` | lines 71–72 (handleClick + handleClose) | ✓ PASS |
| Kaohsiung coordinates in buildCityBias | `grep "22.6273" places-client.ts` | lines 151–152 | ✓ PASS |
| 375px / DISP-04 Tabs toggle | browser required | N/A | ? SKIP |
| Google Maps InfoWindow runtime click | browser + API key required | N/A | ? SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| DISP-01 | 03-01, 03-02 | Day-by-day itinerary table with time intervals | ✓ SATISFIED | DayCard "第 N 天" + PlaceRow time slots; itinerary-view.test.tsx 4/4 pass |
| DISP-02 | 03-01, 03-03 | Each place shows opening hours + ticket info | ✓ SATISFIED | PlaceRow renders hours/price from use-place-details; place-row.test.tsx 4/4 pass |
| DISP-03 | 03-01, 03-04 | Interactive map with per-day colored routes | ✓ SATISFIED | MapView: Polyline+AdvancedMarker+InfoWindow per day; map-view.test.tsx 6/6 pass |
| DISP-04 | 03-04 | Mobile-friendly (RWD) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | ResultsLayout md:hidden Tabs + hidden md:flex desktop split present and wired; runtime scroll behavior needs browser |
| AUTH-01 | 03-01, 03-02, 03-03, 03-04 | Anonymous users can complete full itinerary flow | ✓ SATISFIED | No auth imports in any Phase 3 component; E2E test 7/7 pass |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/place-input-panel.tsx` line 21 | Comment mentions "MapView placeholder" | ℹ️ Info | Comment is stale (placeholder was replaced by 03-04); does not affect behavior |
| `src/components/place-row.tsx` | `summarizeHours`: first period only | ℹ️ Info | Intentional Phase 5 deferral; documented; renders "有營業時間" for unrecognized formats — does not block DISP-02 |
| `src/components/place-input-panel.tsx` | `loadingLabel` prop on ProgressSteps unused | ℹ️ Info | Intentional Phase 4 deferral; prop is ready; button already shows "最佳化中..." |

No TBD, FIXME, or XXX markers found in any Phase 3 component file. No unresolved debt markers.

---

### Human Verification Required

#### 1. Mobile Responsive Layout at 375px (DISP-04)

**Test:** Open the app in a browser at 375px viewport width (Chrome DevTools device emulation). Paste 2–3 place names with a city, complete the resolve → optimize flow.
**Expected:** No horizontal scrollbar at 375px at any step; itinerary results show a Tabs component with "行程表" and "地圖" triggers (each at least 44px tall); switching tabs toggles between itinerary and map panels without clipping.
**Why human:** CSS responsive breakpoints (`md:hidden` / `hidden md:flex`) and overflow/scroll behavior at a specific viewport width require a real browser with layout engine.

#### 2. Google Maps InfoWindow Runtime Behavior (SC4 map side)

**Test:** With `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` set to a valid Maps JavaScript API key, complete the resolve → optimize flow and observe the map. Click on a numbered marker.
**Expected:** InfoWindow opens above the marker with: place name (bold), time slot (e.g. "09:00 – 11:00"), and — when the visit has `hoursUnknown=true` — the amber text "營業時間未知，建議出發前確認". Clicking the same marker again or clicking elsewhere closes the window. No browser tab CPU spike or infinite re-render.
**Why human:** `@vis.gl/react-google-maps` `APIProvider`, `AdvancedMarker`, and `InfoWindow` require a live Maps API key and browser DOM. The `useCallback` infinite-re-render guard (#404) can only be confirmed by observing the absence of CPU runaway in a browser session.

---

### Gaps Summary

No blocking gaps found. All must-have artifacts are substantive and wired. All 5 requirements (DISP-01, DISP-02, DISP-03, DISP-04, AUTH-01) have implementation evidence. The 2 open items are browser-runtime behaviors that cannot be verified without a live browser session.

---

_Verified: 2026-06-26T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
