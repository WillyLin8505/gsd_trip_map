# Phase 6: Interactive Single-Day Editing - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Source:** Approved design spec (`docs/superpowers/specs/2026-06-26-interactive-day-editing-design.md`)

<domain>
## Phase Boundary

Two results-page features that edit ONE day after the itinerary is generated.
Independent of Part A (input redesign, done) and Part B (AI recommendations, separate).

- **F1 — Add place (EDIT-01):** user pastes a new place on the results page; the
  system resolves it and appends it to the geographically closest existing day
  (re-times that day, keeps the existing order). Does NOT re-run the whole itinerary.
- **F2 — Auto-arrange day (EDIT-02):** a per-day button re-orders only that day by
  shortest path and slots that day's restaurants into lunch/dinner windows.

F1 and F2 are independent — adding a place does NOT auto-arrange the day.

**In scope:** `scheduleSingleDay` pure primitive, `classifyPlace` + `pickClosestDay`
helpers, `POST /api/optimize/day` route, results-page `DayPlaceAdder` (F1) + per-day
「自動安排」 button (F2), `replaceDay` client updater.

**Out of scope (this phase):** AI-recommended places (Part B); persisting edits
separately from the existing save flow (save re-saves current state); cross-day moves
/ drag-and-drop reordering (v2).
</domain>

<decisions>
## Implementation Decisions (LOCKED — from approved spec)

### Place categories — 3-type taxonomy (auto from Google `place_types`)
- **餐廳 (restaurant):** place_types intersect `{restaurant, food, meal_takeaway, meal_delivery}` → eligible for lunch/dinner meal slots.
- **點心 (snack):** place_types intersect `{cafe, bakery, dessert, ice_cream_shop, bar}` → treated as a normal SHORT route stop (NO meal slot).
- **行程 (attraction):** everything else → normal route stop.
- Only 餐廳 drives meal slotting; 點心 + 行程 are BOTH ordinary shortest-path stops.
- A place matching both restaurant and snack types resolves to 餐廳 (restaurant wins).
- Missing/null `place_types` → treated as 行程 (attraction, no meal slot).

### Meal windows (global constants)
- **Lunch:** 11:30–13:30 (the slot START must fall in the window).
- **Dinner:** 17:30–19:30.

### Closest-day metric (F1)
- For a new place `p`, day distance = min over that day's places of haversine(p, place).
- Chosen day = the day with the smallest such distance.

### Single-day scheduler (pure) — `src/lib/optimizer/day.ts`
- `scheduleSingleDay(places, matrix, opts, mode: { reorder: boolean; dayNumber: number })`
  → `{ day: { dayNumber, visits: ScheduledVisit[] }, unscheduled: {placeId, reason}[] }`.
- `reorder=false` (F1): keep the given order; assign times (reuse the time-walk from `scheduleTimes` for a single day).
- `reorder=true` (F2):
  1. Classify each place (`classifyPlace`). `R` = 餐廳 only. `A` = 點心 + 行程 = all route stops.
  2. Order `A` with `nearestNeighbor` + `twoOptImprove` over the A-submatrix.
  3. Walk the clock from `dailyStartMinutes`; on entering the lunch window with no lunch placed and `R` non-empty, insert the `R` member nearest the current location; same for dinner. Extra restaurants (>2) are placed in route order like attractions.
  4. If `R` is empty → plain shortest-path.
  5. Assign times (opening hours respected; `hoursUnknown` slot kept with warning, as in `scheduleTimes`).
- Pure, NO I/O (no fetch, DB, or process.env) — same purity contract as the existing optimizer modules.
- `classifyPlace(placeTypes: string[] | null): "restaurant" | "snack" | "attraction"` helper.

### Single-day API — `POST /api/optimize/day`
- Body: `{ placeIds: string[] (1–25), reorder: boolean, dayNumber?: number (default 1), travelDate?: string }`.
- Load places from DB (incl. `place_types`), build `OptimizerPlace[]` (same mapping as `/api/optimize`), `computeRouteMatrix` for these coords, run `scheduleSingleDay`, return `{ day, unscheduled }`.
- Reuse the Zod validation pattern + 422 for unresolved placeIds + `getDb()` guard from existing routes.

### Results-page UI
- **F1 `DayPlaceAdder`** (new component): paste/text input + 「加入行程」 button. On submit → `POST /api/places/resolve` (city = current `resolvedCity` or omit) → take first resolved place → `pickClosestDay(newPlace, daysWithCoords)` → `POST /api/optimize/day { placeIds:[...thatDay's placeIds, newPlaceId], reorder:false, dayNumber, travelDate }` → `replaceDay`; add the place to `resolvedPlaces`.
- **F2 button** on each `DayCard` header: 「自動安排」 → `POST /api/optimize/day { placeIds: thatDay's placeIds, reorder:true, dayNumber, travelDate }` → `replaceDay`.
- `pickClosestDay` is a pure helper (`src/lib/places/closest-day.ts`) tested independently (haversine).

### Client state
- `place-input-panel` gains `replaceDay(dayNumber, newDay)` → returns a new `OptimizeResult` with that day swapped. New place's coords merged into `resolvedPlaces` so the map/coord-join still works.
- `travelDate` / `numDays` from Part A reused for the day calls (travelDate → day-of-week).

### Error handling (LOCKED)
- Day API failure → keep the existing day, show an inline message; NEVER wipe the itinerary.
- New place NOT_FOUND (F1) → message 「找不到這個地點」.
- Missing `place_types` → normal attraction (no meal slot).
- No DB / no API key → same guards as existing routes (500 with clear error).

### Claude's Discretion
- Exact component file layout for `DayPlaceAdder` and the F2 button wiring within `place-input-panel.tsx` / `DayCard`.
- Loading/disabled states and inline-error copy beyond the locked NOT_FOUND string.
- Internal helper signatures not pinned above (e.g. submatrix extraction utility).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract
- `docs/superpowers/specs/2026-06-26-interactive-day-editing-design.md` — the approved sub-project C design (3-category classifier, meal windows, API contract, test plan). Authoritative for this phase.

### Existing code to reuse (named in the spec)
- `src/lib/optimizer/route.ts` — `nearestNeighbor`, `twoOptImprove`.
- `src/lib/optimizer/schedule.ts` — `scheduleTimes`, `getOpenWindow`, `minutesToHHMM` (time-walk to reuse for single day).
- `src/lib/optimizer/types.ts` — `ScheduledVisit`, `OptimizerPlace`.
- `src/lib/routes-client.ts` — `computeRouteMatrix(coords, apiKey)`.
- `/api/optimize` route — `OptimizerPlace` build pattern + Zod validation + 422 + `getDb()` guard to mirror.
- `/api/places/resolve` + `/api/places/details` — resolve flow; `place_types` populated by details (NOT resolve); results page already fetches details via `usePlaceDetails`.
- `src/.../place-input-panel.tsx` — holds `optimizeResult` (OptimizeResult) + `resolvedPlaces` (coords); renders `ResultsLayout → ItineraryView → DayCard`.

### Project rules
- `.claude/CLAUDE.md` — Google Places API (New) only at `places.googleapis.com/v1`; all Google calls server-side; field masking mandatory.
</canonical_refs>

<specifics>
## Specific Ideas

- Test plan (from spec):
  - `day.test.ts`: `classifyPlace` (restaurant/snack/attraction; restaurant-wins tie); `scheduleSingleDay` reorder=false (order kept, times assigned); reorder=true (attractions shortest-path; one restaurant → lunch; two → lunch+dinner; none → plain).
  - `closest-day.test.ts`: `pickClosestDay` picks nearest day; single-day + tie cases.
  - `optimize/day` route test: validation, 422 unresolved, reorder true/false paths (mock `computeRouteMatrix` + DB).
- vitest runs on Windows in this repo (Node env, pure-data assertions for component-adjacent tests).
</specifics>

<deferred>
## Deferred Ideas

- AI-recommended restaurants/places (Part B — separate brainstorm/spec).
- Persisting edits separately from the existing save flow.
- Cross-day moves / drag-and-drop reordering (v2).
</deferred>

---

*Phase: 06-interactive-day-editing*
*Context generated: 2026-06-27 from approved sub-project C spec*
