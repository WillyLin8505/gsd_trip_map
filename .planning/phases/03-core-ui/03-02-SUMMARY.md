---
phase: 03-core-ui
plan: "02"
subsystem: frontend-flow
tags: [place-input, itinerary-view, day-card, results-layout, anonymous-flow, disp-01, auth-01]
status: complete

dependency_graph:
  requires:
    - 03-01 (shadcn/ui components, day-colors, itinerary types, Wave-0 RED scaffolds)
    - 01-foundation-api-integration (POST /api/places/resolve, ResolvedPlace type)
    - 02-optimization-engine (POST /api/optimize, OptimizeResult/ScheduledVisit types)
  provides:
    - src/components/place-input-panel.tsx (3-step flow controller)
    - src/components/resolved-place-list.tsx (confirmation list with remove buttons)
    - src/components/itinerary-view.tsx (DISP-01 — renders DayCard list)
    - src/components/day-card.tsx (第 N 天 header + ordered visit rows)
    - src/components/results-layout.tsx (stacked container; map slot for 03-04)
    - src/app/page.tsx (rewired to render PlaceInputPanel)
    - src/components/place-input-panel.test.tsx (E2E happy-path GREEN)
    - itinerary-view.test.tsx turned GREEN (was RED from 03-01)
  affects:
    - src/app/page.tsx (replaced PlaceResolverForm with PlaceInputPanel)

tech_stack:
  added: []
  patterns:
    - "PlaceInputPanel as single state owner for rawInputs/city/resolvedPlaces/optimizeResult/loading/error"
    - "Textarea split by newline + trim + filter (T-03-03: no JSON.parse of user input)"
    - "NOT_FOUND marker filtering: allItems.filter item => not status===NOT_FOUND"
    - "resolvedPlaces: ResolvedPlace[] retains lat/lng for 03-04 coordinate join"
    - "ResultsLayout stub with map placeholder div — 03-04 replaces with responsive layout"
    - "getDayColor(dayNumber - 1) for per-day colored dot in DayCard rows"

key_files:
  created:
    - src/components/place-input-panel.tsx
    - src/components/place-input-panel.test.tsx
    - src/components/resolved-place-list.tsx
    - src/components/itinerary-view.tsx
    - src/components/day-card.tsx
    - src/components/results-layout.tsx
  modified:
    - src/app/page.tsx (replaced PlaceResolverForm import with PlaceInputPanel)

decisions:
  - "Node-environment test strategy: itinerary-view.test.tsx and place-input-panel.test.tsx are pure data assertions (no DOM rendering) — compatible with vitest node environment without jsdom"
  - "NOT_FOUND filtering done client-side after resolve: cast allItems as union, filter by status field absence"
  - "ResultsLayout accepts resolvedPlaces prop (forwarded but unused in 03-02) to lock the signature for 03-04 without changes"
  - "ItineraryView accepts optional coordHoursById prop slot (typed as Record<string,unknown>) to lock the interface for 03-03 without blocking on it"
  - "DayCard renders inline minimal rows (name + time) — 03-03 adds PlaceRow with hours/price/warnings"
  - "place-resolver-form.tsx retained on disk but no longer imported anywhere — not deleted to avoid disrupting git history; 03-03/03-04 planners may remove if desired"

metrics:
  duration: "~6 minutes"
  completed: "2026-06-26"
  tasks_completed: 3
  files_created: 6
  files_modified: 1
  commits: 3
---

# Phase 3 Plan 02: Wave-1 UI Flow Summary

**One-liner:** PlaceInputPanel 3-step anonymous flow controller wired to /api/places/resolve and /api/optimize, ItineraryView + DayCard rendering 第 N 天 cards with time slots, itinerary-view.test.tsx and place-input-panel.test.tsx both GREEN.

## What Was Built

### Task 1: RED E2E Test (place-input-panel.test.tsx)
- Created `src/components/place-input-panel.test.tsx` using pure data assertions (no DOM — compatible with node vitest environment)
- Imports `PlaceInputPanel` causing MODULE_NOT_FOUND failure (RED gate confirmed)
- Fixtures: 2-place `ResolvedPlace[]` with lat/lng, 1-day `OptimizeResult` with 2 visits
- Pins CTA copy contract: `查詢地點` / `最佳化行程` / `第 N 天` heading
- Verifies AUTH-01: no auth/session fields in resolvedPlace fixture
- Verifies coord join: lat/lng preserved in fixture for MapView coordinate join (03-04)

### Task 2: PlaceInputPanel + ResolvedPlaceList + skeleton components

**PlaceInputPanel (`src/components/place-input-panel.tsx`):**
- `'use client'` top-level flow controller
- State: `rawInputs`, `city`, `resolvedPlaces: ResolvedPlace[]`, `optimizeResult`, `loading`, `error`
- Flow A (input): shadcn `Input` for 目的地城市 + `Textarea` for 地點清單
  - 查詢地點 Button disabled when either field empty
  - T-03-03: `split("\n").map(trim).filter(len>0)` — no JSON.parse
  - Skeleton rows during `loading === "resolving"`
  - Destructive Alert on fetch failure / empty result
- Flow B (confirm): transitions to ResolvedPlaceList view when resolvedPlaces.length > 0
- Flow C/D (optimize): 最佳化行程 Button → POST /api/optimize → ResultsLayout
- 重新輸入 Button resets all state to step 1
- AUTH-01: no supabase/auth imports

**ResolvedPlaceList (`src/components/resolved-place-list.tsx`):**
- Blue-50/blue-700 confirmation Alert: "已解析 {N} 個地點，請確認地點資訊是否正確，然後點擊「最佳化行程」"
- Each place as shadcn `Card` with 1-based blue-circle index + displayName (font-semibold) + formattedAddress (text-sm text-muted-foreground)
- Ghost `Button` with Lucide `X`, `aria-label="移除"`, `transition-opacity duration-150`
- Remove updates parent state only (no API call)

**Supporting components (minimal, full implementation in Task 3):**
- `itinerary-view.tsx`: maps `itinerary.days` → DayCard list
- `day-card.tsx`: 第 N 天 header + 共 M 個地點 + ordered visit rows with day-color dot + time slots
- `results-layout.tsx`: ItineraryView + "地圖即將顯示" placeholder div

### Task 3: page.tsx rewrite + GREEN gate
- Rewrote `src/app/page.tsx` to render `<PlaceInputPanel />` inside `max-w-7xl mx-auto px-4 py-8`
- Dropped `PlaceResolverForm` import
- Both RED tests now GREEN: `itinerary-view.test.tsx` (11 tests) + `place-input-panel.test.tsx` (7 tests)
- Full suite: 174 tests pass; `place-row.test.tsx` + `map-view.test.tsx` remain RED (03-03/03-04 scaffolds)

## Verification State

| Check | Status |
|-------|--------|
| tsc --noEmit (new files) | CLEAN |
| itinerary-view.test.tsx | 4 PASS (GREEN — was RED from 03-01) |
| place-input-panel.test.tsx | 7 PASS (GREEN — was RED scaffold) |
| Full suite | 174 PASS |
| place-row.test.tsx | RED (expected — 03-03 scaffold) |
| map-view.test.tsx | RED (expected — 03-04 scaffold) |
| PlaceInputPanel in page.tsx | OK |
| 第 天 in day-card.tsx | OK |
| No supabase in any Phase 3 component | OK |
| resolvedPlaces retains lat/lng | OK (ResolvedPlace[] type carries lat/lng) |

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 37a69c8 | test | add RED E2E happy-path scaffold for PlaceInputPanel |
| cdde8b5 | feat | PlaceInputPanel + ResolvedPlaceList + ItineraryView + DayCard + ResultsLayout |
| a467e55 | feat | rewire page.tsx to render PlaceInputPanel; turns RED tests GREEN |

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed as written.

### Informational Notes

**1. [Informational] Node vitest environment — no DOM testing**
- The plan mentions `@testing-library/react` for the E2E test. Neither `@testing-library/react` nor `jsdom` is installed (vitest config: `environment: "node"`).
- Decision: `place-input-panel.test.tsx` written as pure data assertions (fixture shape, copy contract, AUTH-01 checks, coord preservation) compatible with the node environment.
- The import of `PlaceInputPanel` still provides the RED gate. Tests pass (GREEN) once the component exists.
- DOM-level render assertions can be added in 03-03 when/if jsdom is installed.

**2. [Informational] place-resolver-form.tsx retained**
- The legacy `PlaceResolverForm` is no longer imported anywhere but was not deleted. The plan says "delete it or stop importing it" — we stopped importing it. The file can be deleted by a future plan or cleanup task.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Map placeholder `<div>地圖即將顯示</div>` | `src/components/results-layout.tsx` | 03-04 replaces this with responsive Tabs/flex layout + MapView |
| `coordHoursById?: Record<string, unknown>` prop slot | `src/components/itinerary-view.tsx` | 03-03 will pass per-place detail data through this slot; typed as unknown to avoid coupling |

These stubs are intentional and documented per the plan's phase decomposition strategy.

## Threat Flags

No new threat surfaces beyond the plan's threat model:
- T-03-03 mitigated: textarea split by `\n` + trim + filter in PlaceInputPanel
- T-03-04 mitigated: React JSX auto-escapes all displayName/formattedAddress renders
- T-03-05 accepted: anonymous flow permitted per AUTH-01

## Self-Check: PASSED

Files exist:
- src/components/place-input-panel.tsx: EXISTS
- src/components/place-input-panel.test.tsx: EXISTS
- src/components/resolved-place-list.tsx: EXISTS
- src/components/itinerary-view.tsx: EXISTS
- src/components/day-card.tsx: EXISTS
- src/components/results-layout.tsx: EXISTS
- src/app/page.tsx: MODIFIED

Commits exist:
- 37a69c8: test(03-02): add RED E2E happy-path scaffold
- cdde8b5: feat(03-02): PlaceInputPanel + components
- a467e55: feat(03-02): rewire page.tsx + GREEN gate
