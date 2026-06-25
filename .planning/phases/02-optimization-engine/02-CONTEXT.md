# Phase 2: Optimization Engine — Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Synthesized from project research (ARCHITECTURE.md, PITFALLS.md) + Phase 1 completed artifacts

<domain>
## Phase Boundary

Phase 2 delivers the core product differentiator: a server-side optimizer that accepts a list of resolved places (placeIds already in the `places` cache from Phase 1) and returns a validated, structured day-by-day schedule.

**Phase 2 delivers:**
- `POST /api/optimize` Route Handler — accepts resolved place list + optional numDays, returns day-grouped schedule
- `OptimizerService` — pure TypeScript module: `buildDistanceMatrix()`, `nearestNeighbor()`, `twoOptImprove()`, `splitIntoDays()`, `scheduleTimes()`
- Google Routes API `computeRouteMatrix` integration for N×N travel time matrix
- `isOpenAt(periods, dayOfWeek, localTimeMinutes)` utility for opening hours feasibility checking
- Auto-suggest day count (`ceil(sum(visitDurations + avgTravelTimes) / dailyBudgetHours)`)
- Test suite with at least 3 itinerary scenarios (small/medium/large N, mixed opening-hour constraints)

**Phase 2 does NOT include:**
- UI for displaying the schedule (Phase 3: ItineraryView, MapView)
- Saving itineraries to DB (Phase 4)
- Auth-gated itinerary persistence (Phase 4)
- Rate limiting / per-user API caps (Phase 5)
- Drag-and-drop reorder (Phase 5)

**Phase 2 depends on Phase 1:**
- `places` table rows (cached opening hours JSONB, coords, default_visit_duration_minutes, hours_unknown)
- `GOOGLE_PLACES_API_KEY` server-side key (also used for Routes API calls)
- Supabase DB client (Drizzle + postgres driver)
- TypeScript + Vitest test infrastructure already scaffolded

</domain>

<decisions>
## Implementation Decisions

### Algorithm Choice
- **Nearest Neighbor + 2-opt** — TypeScript, zero external dependencies, <50ms for N≤30 POIs
- Do NOT use exact TSP (Held-Karp): exponential time, impractical for N>15
- Do NOT add OR-Tools/Python binding: overengineering for v1
- For N>30: fall back to Google Routes API `optimizeWaypointOrder: true` (max 25 intermediate waypoints per call; chain calls for N>25)

### Distance Matrix Source
- **Google Routes API `computeRouteMatrix`** — single HTTP call returns N×N travel durations (driving)
- NOT nearest-neighbor by straight-line (Haversine) — travel time matters, not crow-flight distance
- Single matrix call for all N×N pairs before optimization begins; do not re-call during optimization
- Cost: Routes API Essentials — up to 625 elements per request, within free tier for typical N≤20

### Time-Window (Opening Hours) Strategy
- **isOpenAt(periods, dayOfWeek, timeMinutes)** — compare in LOCAL time using `utcOffsetMinutes` from `places` table
- During Nearest Neighbor construction: skip infeasible candidates (arrival > close time); push violated POI to next day's pool
- During 2-opt: after each swap, re-validate all time windows in the affected segment; reject infeasible swaps
- **hoursUnknown rule (CRITICAL):** places with `hours_unknown = true` retain their schedule slot but emit a `hoursUnknown: true` warning — NEVER treat as "always open", NEVER drop from schedule without user confirmation
- `utcOffsetMinutes` from Phase 1's `places` table is the source of truth for timezone-correct scheduling

### Day-Splitting Algorithm
- **Greedy bin-packing on the optimized single-route sequence** (not re-clustering)
- Daily budget: `dailyStartTime = 09:00`, `dailyEndTime = 21:00` (12-hour window)
- Accumulate `visitDuration + travelFromPrev` per POI; overflow → start new day
- Auto-suggest `numDays = ceil(sum(visitDurations + avgTravelTimes) / dailyBudgetHours)` where avgTravelTime is average of all matrix entries
- Caller-supplied `numDays` overrides the suggestion (SCHED-02 requirement)

### Scheduling Times
- For each day, walk assigned POIs in order:
  - `arrivalTime = prevDepartureTime + travelFromPrev`
  - If `arrivalTime < openTime` → wait (arrival is too early; set `waitMinutes`)
  - `scheduledStart = max(arrivalTime, openTime)`
  - `scheduledEnd = scheduledStart + visitDuration`
  - If `scheduledEnd > closeTime` → skip to next day (edge case: place can't fit in remaining window)
- First POI of each day starts at `dailyStartTime` (09:00) with 0 travel from prev

### API Endpoint Contract
```
POST /api/optimize
Request: {
  placeIds: string[],   // placeIds already in places cache
  numDays?: number,     // optional override; auto-calculated if omitted
  travelDate?: string,  // ISO date of first travel day (default: next Monday)
}
Response: {
  suggestedDays: number,
  days: [{
    dayNumber: number,
    visits: [{
      placeId: string,
      displayName: string,
      scheduledStart: string,  // "HH:MM"
      scheduledEnd: string,    // "HH:MM"
      travelFromPrevMinutes: number,
      waitMinutes: number,     // if arrived before open
      hoursUnknown: boolean,
      warning?: string,
    }]
  }],
  unscheduled: [{placeId: string, reason: string}]  // POIs that couldn't be placed
}
```

### OptimizerService — Pure Function Module
- Zero external dependencies, zero DB calls, zero HTTP calls
- Inputs: place data array (from DB) + N×N travel time matrix (from Routes API)
- Outputs: structured schedule (no side effects)
- Test in isolation with mock data — no Supabase, no Google API needed for unit tests
- Live Routes API calls only in `POST /api/optimize` Route Handler, before calling OptimizerService

### Required Test Scenarios
1. **Small N (5 places)** — all open normal hours, 2 days suggested, straightforward
2. **Medium N (10 places)** — mixed opening hours (one closed Mondays, one closes at 17:00), auto-day calculation correct
3. **Large N (20 places)** — some hours_unknown places, output includes hoursUnknown warnings, no crash

### Claude's Discretion
- Exact `isOpenAt()` implementation (handling midnight-crossing periods, 24h open)
- Whether to expose `waitMinutes` in test assertions or just `scheduledStart`
- File structure within `src/lib/optimizer/` (one file vs multiple)
- Whether to use `number` (minutes since midnight) or string ("HH:MM") internally for times
- Exact 2-opt pass count (3-5 passes is the guidance)
- Meal-time heuristic: DEFER to Phase 5 — Phase 2 treats restaurants same as any POI

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Output (already built — read before coding to reuse patterns)
- `src/lib/db/schema.ts` — places table schema (opening_hours JSONB, utc_offset_minutes, hours_unknown, default_visit_duration_minutes, lat, lng)
- `src/lib/places/duration-table.ts` — durationForTypes() lookup (reuse, don't duplicate)
- `src/lib/google/places-client.ts` — Google client patterns (field masking, API key handling)
- `.planning/phases/01-foundation-api-integration/01-01-SUMMARY.md` — Walking Skeleton architecture

### Project Research (authoritative for algorithm decisions)
- `.planning/research/ARCHITECTURE.md` — OptimizerService pipeline (Steps 1–5), Routes API matrix call, day-splitting strategy, algorithm comparison table
- `.planning/research/PITFALLS.md` — Pitfall on opening hours timezone (utcOffsetMinutes), Pitfall on treating hoursUnknown as always-open, meal scheduling anti-pattern

### Schema Decisions (from Phase 1 CONTEXT.md)
- `places.opening_hours` = JSONB (regularOpeningHours.periods array from Google API)
- `places.utc_offset_minutes` = INTEGER (required for timezone-correct isOpenAt)
- `places.hours_unknown` = BOOLEAN (absent regularOpeningHours → true; never treat as always-open)

</canonical_refs>

<specifics>
## Specific Constraints

- **hoursUnknown rule is CRITICAL** — places with `hours_unknown = true` MUST NOT be treated as always open during scheduling. They get a schedule slot but emit a warning. This is the Phase 1 contract.
- **utcOffsetMinutes REQUIRED** — all opening hours comparisons must convert to local time using `places.utc_offset_minutes`. Without this, overnight/international trips get wrong schedules.
- **OptimizerService must be a pure function** — no HTTP, no DB inside the optimizer. This makes it unit-testable without mocking infrastructure.
- **Routes API matrix is a single pre-call** — fetch the N×N matrix before calling OptimizerService. The optimizer receives the matrix as input; it does not fetch data.
- **2-opt constraint**: after each edge swap, re-validate time-window feasibility for all visits in the swapped segment before accepting the swap.
- **unscheduled places**: if a POI cannot fit any day (e.g., always closed, or visit duration exceeds full day), include it in `unscheduled[]` with a reason string rather than silently dropping it.

</specifics>

<deferred>
## Deferred to Later Phases

- ItineraryView, MapView — Phase 3
- Save itinerary to DB (itineraries, itinerary_days, place_visits tables) — Phase 4
- Auth-gated itinerary saving — Phase 4
- Public share links — Phase 4
- Meal-time heuristics (schedule restaurants in lunch/dinner windows) — Phase 5
- Rate limiting (50 searches/user/day) — Phase 5
- Manual visit duration override UI — Phase 5
- N>30 Routes API chain calls (optimize_waypoints for large N) — Phase 5 or future

</deferred>

---

*Phase: 02-optimization-engine*
*Context gathered: 2026-06-25 via project research synthesis*
