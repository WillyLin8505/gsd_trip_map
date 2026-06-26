# Sub-project C — Interactive single-day editing (Design)

**Date:** 2026-06-26
**Status:** Approved (design)
**Scope:** Two results-page features that edit one day after the itinerary is
generated. Independent of Part A (input redesign, done) and Part B (AI
recommendations from a URL source, separate).

## Goal

Let the user refine a generated itinerary one day at a time:
- **F1 — Add place:** paste a new place on the results page; the system resolves
  it and appends it to the geographically closest existing day (re-times that day,
  keeps order).
- **F2 — Auto-arrange day:** a per-day button that re-orders that day by shortest
  path and slots the day's restaurants into lunch/dinner windows.

F1 and F2 are independent (adding does NOT auto-arrange).

## Current state (reuse)

- Optimizer (`src/lib/optimizer/`): `nearestNeighbor`, `twoOptImprove`
  (`route.ts`); `scheduleTimes`, `getOpenWindow`, `minutesToHHMM`, types
  `ScheduledVisit`/`OptimizerPlace` (`schedule.ts`, `types.ts`). It splits ALL
  places into days at once — no single-day primitive yet.
- Routes matrix: `computeRouteMatrix(coords, apiKey)` (`routes-client.ts`).
- Results page: `place-input-panel.tsx` holds `optimizeResult` (OptimizeResult)
  and `resolvedPlaces` (coords); renders `ResultsLayout → ItineraryView → DayCard`.
- `place_types` live on the `places` table and are populated by
  `/api/places/details` (NOT by `/api/places/resolve`). The results page already
  fetches details via `usePlaceDetails`.
- DB access: `getDb()`; `OptimizerPlace` build pattern in `/api/optimize`.

## Global constants

- **Lunch window:** 11:30–13:30 (start must fall in window). **Dinner window:** 17:30–19:30.
- **Restaurant detection:** `place_types` intersects
  `{restaurant, cafe, food, meal_takeaway, meal_delivery, bakery, bar}`.
- **Closest-day metric:** for a new place `p`, day distance = min over the day's
  places of haversine(p, place); chosen day = smallest such distance.

## Design

### 1. Single-day scheduler (pure) — `src/lib/optimizer/day.ts`
`scheduleSingleDay(places: OptimizerPlace[], matrix: TravelMatrix, opts: ScheduleTimesOpts, mode: { reorder: boolean; dayNumber: number }): { day: { dayNumber; visits: ScheduledVisit[] }; unscheduled: {placeId; reason}[] }`

- `reorder=false` (F1): keep the given order; assign times (reuse the time-walk
  from `scheduleTimes` for a single day).
- `reorder=true` (F2):
  1. Partition into restaurants `R` and attractions `A` (by `place_types`).
  2. Order `A` with `nearestNeighbor` + `twoOptImprove` over the A-submatrix.
  3. Walk the clock from `dailyStartMinutes`; when it enters the lunch window and
     no lunch placed and `R` non-empty, insert the `R` member nearest the current
     location; same for dinner. Extra restaurants (>2) are placed in route order
     like attractions.
  4. If `R` is empty, it's plain shortest-path.
  5. Assign times (opening-hours respected; `hoursUnknown` kept with warning, as
     in `scheduleTimes`).
- Pure, no I/O. `isRestaurant(placeTypes: string[] | null): boolean` helper.

### 2. Single-day API — `POST /api/optimize/day`
- Body: `{ placeIds: string[] (1–25), reorder: boolean, dayNumber?: number (default 1), travelDate?: string }`.
- Load places from DB (incl. `place_types`), build `OptimizerPlace[]` (same
  mapping as `/api/optimize`), `computeRouteMatrix` for these coords, run
  `scheduleSingleDay`, return `{ day, unscheduled }`.
- Reuses Zod validation pattern + 422 for unresolved placeIds + `getDb()` guard.

### 3. Results-page UI (`place-input-panel.tsx` + small components)
- **F1 `DayPlaceAdder`** (new component): a paste/text input + 「加入行程」 button.
  On submit → `POST /api/places/resolve` (city = current `resolvedCity` or omit)
  → take first resolved place → `pickClosestDay(newPlace, daysWithCoords)` →
  `POST /api/optimize/day` with `{ placeIds: [...thatDay's placeIds, newPlaceId], reorder:false, dayNumber, travelDate }`
  → replace that day in `optimizeResult`; add the place to `resolvedPlaces`.
- **F2 button** on each `DayCard` header: 「自動安排」 → `POST /api/optimize/day`
  `{ placeIds: thatDay's placeIds, reorder:true, dayNumber, travelDate }` →
  replace that day.
- `pickClosestDay` is a pure helper (`src/lib/places/closest-day.ts`) tested
  independently (haversine).

### 4. Client state
- `place-input-panel` gains a `replaceDay(dayNumber, newDay)` updater that returns
  a new `OptimizeResult` with that day swapped. New place's coords merged into
  `resolvedPlaces` so the map/coord-join still works.
- `travelDate`/`numDays` from Part A are reused for the day calls (travelDate for
  day-of-week).

## Data flow
```
F1: paste → /api/places/resolve → pickClosestDay (client) →
    /api/optimize/day {reorder:false} → replaceDay
F2: 自動安排 → /api/optimize/day {reorder:true} → replaceDay
```

## Error handling
- Day API failure → keep the existing day, show an inline message; never wipe the
  itinerary.
- New place NOT_FOUND (F1) → message "找不到這個地點".
- Missing `place_types` for a place → treated as a normal attraction (no meal slot).
- No DB / no API key → same guards as existing routes (500 with clear error).

## Testing
- `day.test.ts`: `isRestaurant`; `scheduleSingleDay` reorder=false (order kept,
  times assigned); reorder=true (attractions shortest-path; one restaurant → lunch
  slot; two → lunch+dinner; none → plain).
- `closest-day.test.ts`: `pickClosestDay` picks the nearest day; single-day and
  tie cases.
- `optimize/day` route test: validation, 422 unresolved, reorder true/false paths
  (mock `computeRouteMatrix` + DB).

## Out of scope
- AI-recommended restaurants/places (Part B).
- Persisting edits to saved itineraries (existing save flow re-saves current state
  when the user saves).
- Cross-day moves / drag-and-drop reordering (v2).
