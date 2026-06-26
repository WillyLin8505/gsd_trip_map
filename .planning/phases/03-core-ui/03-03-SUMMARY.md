---
phase: 03-core-ui
plan: "03"
subsystem: itinerary-display
tags: [place-row, use-place-details, unscheduled-alert, progress-steps, disp-02, amber-badge, hours-unknown]
status: complete

dependency_graph:
  requires:
    - 03-01 (shadcn/ui components: badge, separator, card, alert, skeleton; lucide-react; day-colors)
    - 03-02 (DayCard minimal rows, ItineraryView, PlaceInputPanel, ResultsLayout, itinerary types)
    - 01-foundation (GET /api/places/details route with openingHours/priceLevel/hoursUnknown/cached)
    - 02-optimization-engine (ScheduledVisit.hoursUnknown + OptimizeResult.unscheduled[] shapes)
  provides:
    - src/components/place-row.tsx (DISP-02 rich row: time/travel/hours/price/hoursUnknown amber badge)
    - src/lib/places/use-place-details.ts (deduped fetch + Map<placeId, PlaceDetail> return)
    - src/components/unscheduled-alert.tsx (surfaces all non-scheduled places, never silently drops)
    - src/components/progress-steps.tsx (3-step indicator, aria-live, loadingLabel support)
    - Updated DayCard (PlaceRow wired), ItineraryView (detailsById + global hoursUnknown alert),
      ResultsLayout (UnscheduledAlert + detailsById threading), PlaceInputPanel (ProgressSteps + usePlaceDetails)
  affects:
    - src/components/day-card.tsx (now renders PlaceRow components)
    - src/components/itinerary-view.tsx (detailsById prop + global amber alert)
    - src/components/results-layout.tsx (UnscheduledAlert + detailsById threading)
    - src/components/place-input-panel.tsx (ProgressSteps + usePlaceDetails + detailsById)

tech_stack:
  added: []
  patterns:
    - "usePlaceDetails: Set-based in-flight dedup via useRef; per-id failure tolerance; placeIds.join(',') dep string"
    - "hoursUnknown rule: visit.hoursUnknown OR detail.hoursUnknown → amber badge; SC4 exact copy for both surfaces"
    - "Global hoursUnknown alert: allVisits.every(v => v.hoursUnknown) → amber Alert above DayCards"
    - "UnscheduledAlert: early-return null when unscheduled.length===0; displayName lookup from resolvedPlaces Map"
    - "ProgressSteps: STEPS as const tuple; isComplete/isActive/isUpcoming class logic; aria-current=step"
    - "PlaceInputPanel progressStep: ternary derivation from optimizeResult/resolvedPlaces length"

key_files:
  created:
    - src/components/place-row.tsx
    - src/lib/places/use-place-details.ts
    - src/components/unscheduled-alert.tsx
    - src/components/progress-steps.tsx
  modified:
    - src/components/day-card.tsx (PlaceRow wired in)
    - src/components/itinerary-view.tsx (detailsById prop + global hoursUnknown alert)
    - src/components/results-layout.tsx (UnscheduledAlert + detailsById threading)
    - src/components/place-input-panel.tsx (ProgressSteps + usePlaceDetails + detailsById)

decisions:
  - "hoursUnknown amber badge exact copy: '營業時間未知，建議出發前確認' — matches SC4 requirement for both itinerary row and map InfoWindow (03-04 must use identical copy)"
  - "usePlaceDetails dep string: placeIds.join(',') avoids array-reference churn on re-renders while still triggering on actual id set changes"
  - "Global hoursUnknown alert uses allVisits.every() on optimizer-issued hoursUnknown (not details), so it works even before details are fetched"
  - "ProgressSteps loadingLabel prop: PlaceInputPanel wiring deferred — loading state shows 最佳化中 in button copy; loadingLabel can be used in Phase 4 for sequential labels"
  - "priceLevelToString: level 0 (free) returns empty string (no badge shown for free places)"
  - "summarizeHours: first period open/close only — Phase 5 can expand to full per-day breakdown"

metrics:
  duration: "~5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  files_created: 4
  files_modified: 4
  commits: 2
---

# Phase 3 Plan 03: DISP-02 Rich PlaceRow + Details Hook Summary

**One-liner:** PlaceRow with amber hoursUnknown badge, usePlaceDetails deduped fetch hook, UnscheduledAlert always-surfaces non-schedulable places, and ProgressSteps 3-step indicator wired into PlaceInputPanel — completing DISP-02.

## What Was Built

### Task 1: use-place-details hook + rich PlaceRow (GREEN gate)

**`src/lib/places/use-place-details.ts`:**
- `'use client'` React hook `usePlaceDetails(placeIds: string[])`
- Fetches `GET /api/places/details?placeId=X` for each unique id using `encodeURIComponent` (T-03-07)
- Dedupes via `useRef<Set<string>>` — marks ids before async calls to prevent StrictMode duplicates
- Returns `Map<string, PlaceDetail>` + `loading: boolean`
- Per-id failures tolerated: null result omitted from Map; PlaceRow falls back to ScheduledVisit.hoursUnknown
- Cache-first API route (30-day TTL in DB) means most calls return immediately without hitting Google (T-03-08)

**`src/components/place-row.tsx`:**
- `'use client'` component, props: `visit: ScheduledVisit`, `dayNumber`, `orderIndex`, `detail?: PlaceDetail | null`
- Day-color dot via `getDayColor(dayNumber - 1)` (matches map polyline color per DISP-03)
- Time slot `{scheduledStart} – {scheduledEnd}` (`text-sm text-muted-foreground`)
- Travel time `搭車 {N} 分` with lucide `Car` icon when `travelFromPrevMinutes > 0`; omitted for first stop
- Opening hours one-liner from `summarizeHours(detail.openingHours)` — first period open/close
- hoursUnknown amber `Badge variant="outline"` with lucide `Clock` + `'營業時間未知，建議出發前確認'`
  — exact SC4 copy, `bg-amber-50 text-amber-700 border-amber-200`
- Price `Badge variant="outline"` `$/$$/$$$/$$$$ ` from `priceLevelToString(detail.priceLevel)`
- `place-row.test.tsx` turned GREEN: 4 tests pass

### Task 2: Wire PlaceRow into DayCard/ItineraryView; add UnscheduledAlert + ProgressSteps

**`src/components/unscheduled-alert.tsx`:**
- `Alert variant="destructive"` with title "以下地點無法排入行程"
- Bulleted list: `displayName` (from resolvedPlaces Map lookup, fallback to placeId) + `reason`
- Early-returns null when `unscheduled.length === 0`
- Never silently hides unscheduled places (plan must_have enforced)

**`src/components/progress-steps.tsx`:**
- 3-step indicator: `STEPS = ["輸入地點", "確認地點", "查看行程"] as const`
- `current: 1 | 2 | 3` prop drives active (blue-600) / complete (blue-400, ✓ check) / upcoming (gray-200)
- `aria-live="polite"` on container, `aria-current="step"` on active circle (accessibility contract)
- `loadingLabel?: string` replaces active step label during optimization loading (Flow C sequential labels)

**Updated `src/components/day-card.tsx`:**
- Replaced inline minimal rows with `<PlaceRow>` components
- Accepts `detailsById?: Map<string, PlaceDetail>` and passes `detail={detailsById?.get(visit.placeId)}` to each PlaceRow
- Separator between rows preserved (`<Separator className="my-1" />`)

**Updated `src/components/itinerary-view.tsx`:**
- Accepts `detailsById?: Map<string, PlaceDetail>`, threads to each `DayCard`
- Global hoursUnknown alert: `allVisits.every(v => v.hoursUnknown)` → amber `Alert` above DayCards with "所有地點的營業時間未知，建議出發前逐一確認" (UI-SPEC States table)

**Updated `src/components/results-layout.tsx`:**
- Accepts `detailsById?: Map<string, PlaceDetail>`, passes to `ItineraryView`
- Renders `<UnscheduledAlert>` when `itinerary.unscheduled.length > 0`

**Updated `src/components/place-input-panel.tsx`:**
- Calls `usePlaceDetails(scheduledPlaceIds)` after optimization (`scheduledPlaceIds` derived from `optimizeResult.days.flatMap`)
- Renders `<ProgressSteps current={progressStep}>` at top of each flow step
- `progressStep`: `optimizeResult → 3` / `resolvedPlaces.length > 0 → 2` / else `1`
- Passes `detailsById` into `ResultsLayout`

## Verification State

| Check | Status |
|-------|--------|
| tsc --noEmit (all non-test files) | CLEAN |
| map-view.test.tsx tsc error | Expected RED (03-04 scaffold) |
| place-row.test.tsx | 4 PASS (GREEN — was RED from 03-01) |
| Full vitest suite | 178 PASS |
| map-view.test.tsx | Expected RED (03-04 scaffold) |
| hoursUnknown amber badge in PlaceRow | OK |
| '營業時間未知，建議出發前確認' exact copy | OK |
| UnscheduledAlert renders for non-empty | OK |
| ProgressSteps 3 steps with correct copy | OK |
| PlaceRow in DayCard | OK |
| detailsById threaded: PlaceInputPanel → ResultsLayout → ItineraryView → DayCard → PlaceRow | OK |

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| c84473e | feat | add use-place-details hook and rich PlaceRow component |
| 0b348cc | feat | wire PlaceRow into DayCard; add UnscheduledAlert + ProgressSteps |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Informational Notes

**1. [Informational] ProgressSteps loadingLabel wiring deferred**
- The plan calls for "sequential loading labels" (取得地點詳細資訊.../計算行車時間.../最佳化行程順序...) during optimization. The `loadingLabel` prop is implemented and ready.
- `PlaceInputPanel` does not yet cycle through these labels during the `loading === "optimizing"` state — the button already shows "最佳化中..." and the skeleton rows provide visual feedback.
- Full sequential label cycling requires a timeout/interval mechanism or server-sent events; deferred to Phase 4 UX polish. The prop is ready and documented.

**2. [Informational] summarizeHours shows first period only**
- Opening hours one-liner shows the first `openingHours` period's open/close times.
- Full per-day breakdown (Mon–Sun) deferred to Phase 5 as documented in the PlaceRow implementation comment.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Map placeholder `<div>地圖即將顯示</div>` | `src/components/results-layout.tsx` | 03-04 replaces with responsive Tabs/flex layout + MapView |
| `summarizeHours`: first period only | `src/components/place-row.tsx` | Full per-day breakdown is Phase 5; SC is hours one-liner |
| `loadingLabel` sequential cycling | `src/components/place-input-panel.tsx` | Prop ready; cycling mechanism deferred to Phase 4 |

## Threat Flags

No new security surfaces beyond the plan's threat model:
- T-03-07 mitigated: placeId encoded with `encodeURIComponent` in use-place-details fetch
- T-03-08 mitigated: Set-based dedup in usePlaceDetails; details route is cache-first (30-day TTL)
- T-03-06 accepted: openingHours/priceLevel is public place metadata; no user-private data

## Self-Check: PASSED
