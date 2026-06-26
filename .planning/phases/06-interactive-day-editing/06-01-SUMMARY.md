---
phase: 06-interactive-day-editing
plan: "01"
subsystem: optimizer-day-editing
tags: [f1-add-place, pure-primitives, api-route, ui-components, phase6]
status: complete

dependency_graph:
  requires:
    - 02-optimizer (scheduleTimes, OptimizerPlace, TravelMatrix)
    - 03-results-ui (ResultsLayout, ItineraryView, DayCard, place-input-panel)
  provides:
    - pickClosestDay (pure haversine helper)
    - scheduleSingleDay (reorder=false pure wrapper over scheduleTimes)
    - POST /api/optimize/day route
    - DayPlaceAdder UI component
    - replaceDay + handleAutoArrange client handlers
  affects:
    - src/components/day-card.tsx (added onAutoArrange prop + F2 button)
    - src/components/itinerary-view.tsx (forwarded onAutoArrange)
    - src/components/results-layout.tsx (dayPlaceAdder slot + onAutoArrange)
    - src/components/place-input-panel.tsx (replaceDay, handleAutoArrange, DayPlaceAdder render)

tech_stack:
  added:
    - src/lib/places/closest-day.ts (haversine, DayWithCoords, pickClosestDay)
    - src/lib/optimizer/day.ts (scheduleSingleDay pure wrapper)
    - src/lib/validation/optimize-day.ts (Zod schema for /api/optimize/day)
    - src/app/api/optimize/day/route.ts (POST handler, 8-step pattern)
    - src/components/day-place-adder.tsx (F1 UI component)
  patterns:
    - Pure module purity contract (no HTTP/DB/process.env in optimizer/places libs)
    - Zod safeParse 400/422/500/502 error ladder (mirrors existing /api/optimize)
    - Functional setOptimizeResult updater (replaceDay preserves suggestedDays)
    - City-conditional resolve body (never city:"" — Pitfall 7)
    - Coords built in placeIds order before computeRouteMatrix (Pitfall 1)

key_files:
  created:
    - src/lib/places/closest-day.ts
    - src/lib/places/closest-day.test.ts
    - src/lib/optimizer/day.ts
    - src/lib/optimizer/day.test.ts
    - src/lib/validation/optimize-day.ts
    - src/app/api/optimize/day/route.ts
    - src/app/api/optimize/day/route.test.ts
    - src/components/day-place-adder.tsx
  modified:
    - src/components/place-input-panel.tsx
    - src/components/results-layout.tsx
    - src/components/itinerary-view.tsx
    - src/components/day-card.tsx

decisions:
  - reorder=true in scheduleSingleDay throws a clear stub error (implemented in plan 06-02)
  - durationOverrides omitted from /api/optimize/day body (v1 known limitation per RESEARCH open question 1)
  - DayPlaceAdder rendered via dayPlaceAdder ReactNode slot in ResultsLayout (place-input-panel owns state)
  - handleAutoArrange throws on !res.ok so DayCard catches and shows per-day error
  - Per-day isArranging/arrangeError state is local to DayCard (other days remain interactive)

metrics:
  duration: "~10 minutes"
  completed: "2026-06-26T17:12:15Z"
  tasks_completed: 3
  tasks_total: 4
  files_created: 8
  files_modified: 4
---

# Phase 06 Plan 01: F1 Add-Place End-to-End Summary

**One-liner:** JWT-free F1 slice — paste a place, haversine closest-day picker routes it to the right day, `/api/optimize/day` re-times it without re-running the whole itinerary, `replaceDay` swaps only that day in the React state.

## Objective

Deliver the complete F1 vertical slice (EDIT-01): paste a place name on the results page → resolve → land in the geographically closest existing day (re-timed, order preserved) → render in the browser. Failures keep the existing itinerary intact.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pure F1 primitives — pickClosestDay + scheduleSingleDay(reorder=false) | c88741b | closest-day.ts, closest-day.test.ts, day.ts, day.test.ts |
| 2 | POST /api/optimize/day route + validation schema | 5b2c8b0 | optimize-day.ts, day/route.ts, day/route.test.ts |
| 3 | DayPlaceAdder UI + replaceDay client wiring | db82b5f | day-place-adder.tsx, place-input-panel.tsx, results-layout.tsx, itinerary-view.tsx, day-card.tsx |
| 4 | Human verify — F1 browser walkthrough | DEFERRED | (see §Deferred Human Verification) |

## Deviations from Plan

None — plan executed exactly as written. All pitfalls honored:

- **Pitfall 1** (matrix index alignment): `orderedRows = placeIds.map(id => rowMap.get(id)!)` then `coords = orderedRows.map(...)` — never from raw `rows`.
- **Pitfall 2** (`getOpenWindow` private): used `scheduleTimes([[indices]], ...)` directly; `getOpenWindow` never imported.
- **Pitfall 3** (`travelDate` required): `effectiveTravelDate = travelDate ?? nextMonday()` inlined in route handler.
- **Pitfall 5** (`replaceDay` preserves `suggestedDays`): functional updater spreads `prev` and swaps only the matching day; route returns `{ day, unscheduled }` not `OptimizeResult`.
- **Pitfall 7** (city never ""): `resolvedCity ? { inputs, city } : { inputs }` in DayPlaceAdder.
- **Pitfall 9** (empty days): `days[0]?.visits ?? []` optional-chain fallback.

## Known Stubs

- `scheduleSingleDay reorder=true` throws a stub error: "implemented in plan 06-02 (EDIT-02 / F2 auto-arrange)". This is intentional — F1 never calls it; F2 is plan 06-02.

## v1 Known Limitation

`durationOverrides` is omitted from the `/api/optimize/day` request body. If a user had overridden visit durations before generating the itinerary, those overrides are not forwarded when F1 or F2 re-schedules a day. The day route uses `default_visit_duration_minutes ?? durationForTypes(place_types)`. Documented in RESEARCH.md §Open Questions #1.

## Deferred Human Verification (Task 4)

**What to verify (browser walkthrough):**

1. Run the dev server and generate a multi-day itinerary.
2. In the 「新增地點」 input at the top of the itinerary column, paste a place name near one day's cluster and click 「加入行程」. Confirm:
   - The place appears in the geographically closest day
   - That day is re-timed (new visit has a scheduled time slot)
   - Other days' order is unchanged
   - The map marker for that day updates (coords merged into resolvedPlaces)
3. Paste a nonsense string. Confirm inline message 「找不到這個地點」 appears and itinerary is unchanged (not wiped).
4. (Optional) Add a place with unknown opening hours and confirm the amber 「營業時間未知，建議出發前確認」 badge appears on that row.

**Resume signal:** Type "approved" or describe issues.

## Test Results

```
 Test Files  27 passed (27)
      Tests  253 passed (253)
   Duration  2.67s
```

TypeScript: `npx tsc --noEmit` — no errors.

New test files contributing to 253 total:
- `src/lib/places/closest-day.test.ts`: 5 tests (pickClosestDay)
- `src/lib/optimizer/day.test.ts`: 6 tests (scheduleSingleDay reorder=false + stub)
- `src/app/api/optimize/day/route.test.ts`: 14 tests (400/422/500/502/200 paths)

## Threat Surface Scan

No new security surface beyond the planned threat model:
- `POST /api/optimize/day` is covered by T-06-01 (DoS cap), T-06-02 (key isolation), T-06-03 (Drizzle parameterized).
- `DayPlaceAdder` calls only our own server routes (`/api/places/resolve`, `/api/optimize/day`) — no direct Google API calls from client.
- `GOOGLE_PLACES_API_KEY` never appears in any client response.

## Self-Check

### Files exist:

- [x] `src/lib/places/closest-day.ts` — FOUND
- [x] `src/lib/places/closest-day.test.ts` — FOUND
- [x] `src/lib/optimizer/day.ts` — FOUND
- [x] `src/lib/optimizer/day.test.ts` — FOUND
- [x] `src/lib/validation/optimize-day.ts` — FOUND
- [x] `src/app/api/optimize/day/route.ts` — FOUND
- [x] `src/app/api/optimize/day/route.test.ts` — FOUND
- [x] `src/components/day-place-adder.tsx` — FOUND

### Commits exist:

- [x] c88741b — feat(06-01): pure F1 primitives
- [x] 5b2c8b0 — feat(06-01): POST /api/optimize/day route
- [x] db82b5f — feat(06-01): DayPlaceAdder UI + replaceDay client wiring

## Self-Check: PASSED
