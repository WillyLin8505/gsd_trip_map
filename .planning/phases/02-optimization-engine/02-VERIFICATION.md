---
phase: 02-optimization-engine
verified: 2026-06-26T00:12:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Optimization Engine Verification Report

**Phase Goal:** A server-side optimizer accepts a resolved place list and produces a validated, structured day-by-day schedule that respects opening hours, minimizes travel distance, and assigns concrete arrival/departure times.
**Verified:** 2026-06-26T00:12:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Given a list of N resolved places, POST /api/optimize returns a schedule grouped into days, each day containing an ordered list of visits with arrival and departure times | ✓ VERIFIED | `src/app/api/optimize/route.ts` — full POST handler; 161/161 tests pass including happy-path 200 response with `days[].visits[].{scheduledStart,scheduledEnd}` assertion |
| 2 | No visit in the output schedule falls outside a place's opening hours window; places with unknown hours are flagged with hoursUnknown and retain their schedule slot with a warning | ✓ VERIFIED | `schedule.ts` hoursUnknown branch retains slot + emits warning; Scenario C test explicitly asserts all 6 hoursUnknown places appear in `visits` (not `unscheduled`) with `hoursUnknown:true` and non-empty `warning`; named test "every hoursUnknown place has hoursUnknown:true in visits output" passes |
| 3 | The optimizer applies nearest-neighbor + 2-opt route improvement — the final route has no obvious visual crossings when rendered on a map | ✓ VERIFIED | `route.ts` exports `nearestNeighbor()` and `twoOptImprove()`; `index.ts` applies both in pipeline order; `twoOptImprove` test asserts strictly improves known-crossing route [0,2,1,3]; monotone guarantee test passes |
| 4 | The system auto-suggests a number of days derived from total visit durations plus estimated travel time; a caller-supplied day count overrides the suggestion | ✓ VERIFIED | `suggestDayCount()` in `schedule.ts` computes `ceil((sumDurations + (N-1)*avgTravel) / budget)`; `optimize()` uses it when `numDays` is omitted; index.test.ts asserts override honored and auto-calc correct; SCHED-01 and SCHED-02 both exercised |
| 5 | A test suite with at least three representative itinerary scenarios (small/medium/large N, mix of opening-hour constraints) passes and produces known-correct day groupings | ✓ VERIFIED | `scenarios.test.ts` — Scenario A (N=5, all-day open), Scenario B (N=10, Monday-closed + 17:00-closer), Scenario C (N=20, 6 hoursUnknown places); 24/24 assertions pass; 161/161 total tests pass across 11 test files |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/optimizer/types.ts` | OptimizerPlace, OptimizeResult interfaces | ✓ VERIFIED | Exports `OptimizerPlace`, `TravelMatrix`, `OptimizerInput`, re-exports `OpeningHoursPeriod` from places-client |
| `src/lib/optimizer/opening-hours.ts` | isOpenAt() using utcOffsetMinutes, toLocalMinutes() | ✓ VERIFIED | `toLocalMinutes` accepts `utcOffsetMinutes: number | null`; `isOpenAt` uses minutes-of-week arithmetic; null offset treated as UTC+0 (no always-open fallback) |
| `src/lib/optimizer/route.ts` | nearestNeighbor(), twoOptImprove() | ✓ VERIFIED | Both functions fully implemented; 11 assertions in route.test.ts all pass; O(N²) nearest-neighbor + 2-opt with 4 passes and early-exit |
| `src/lib/optimizer/schedule.ts` | suggestDayCount(), splitIntoDays(), scheduleTimes() | ✓ VERIFIED | All three functions implemented with correct signatures; 26 assertions in schedule.test.ts pass |
| `src/lib/optimizer/index.ts` | optimize() orchestrates all, returns {suggestedDays, days, unscheduled} | ✓ VERIFIED | Pipeline: nearestNeighbor → twoOptImprove → splitIntoDays → scheduleTimes; overflow merged into `unscheduled[]`; all three top-level fields present in return |
| `src/lib/google/routes-client.ts` | computeRouteMatrix() calls Routes API once | ✓ VERIFIED | Single POST to `routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`; field mask always set; MAX_SAFE_INTEGER sentinel for unreachable pairs |
| `src/app/api/optimize/route.ts` | POST handler with Zod validation, max 25 placeIds, single matrix call | ✓ VERIFIED | Zod schema in `src/lib/validation/optimize.ts` enforces `.max(25)`; 422 for unresolved placeIds; computeRouteMatrix called exactly once (asserted by test `toHaveBeenCalledTimes(1)`) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts (POST)` | `computeRouteMatrix` | `import from "@/lib/google/routes-client"` — called before `optimize()` | ✓ WIRED | Handler imports and calls computeRouteMatrix; result passed as `matrix` to `optimize()` |
| `route.ts (POST)` | `optimize()` | `import from "@/lib/optimizer"` — called with `{places, matrix, numDays, travelDate}` | ✓ WIRED | Handler maps DB rows to `OptimizerPlace[]` and calls `optimize()`; result returned as JSON |
| `index.ts` | `nearestNeighbor, twoOptImprove` | `import from "./route"` | ✓ WIRED | Both imported and called in `optimize()` pipeline steps 2 and 3 |
| `index.ts` | `suggestDayCount, splitIntoDays, scheduleTimes` | `import from "./schedule"` | ✓ WIRED | All three imported and called in `optimize()` pipeline steps 1, 4, 5 |
| `schedule.ts` | `isOpenAt` | `import from "./opening-hours"` — used in `scheduleTimes()` for period feasibility | ✓ WIRED | Imported; hoursUnknown path bypasses it (correct per Pitfall 3); known-hours path calls `getOpenWindow()` and compares against opening window |
| Zod schema | `route.ts (POST)` | `import { optimizeRequestSchema }` — `safeParse(body)` call | ✓ WIRED | Schema imported and used for validation on every request; 400 returned on failure |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `route.ts (POST)` | `rows` | `db.select().from(places).where(inArray(places.place_id, placeIds))` | Real Drizzle query against places cache | ✓ FLOWING |
| `route.ts (POST)` | `matrix` | `computeRouteMatrix(coords, apiKey)` | Live Routes API call (mocked in tests; real in prod) | ✓ FLOWING |
| `route.ts (POST)` | `result` | `optimize({places: optimizerPlaces, matrix, numDays, travelDate})` | Pure optimizer; returns structured schedule | ✓ FLOWING |
| `route.ts (POST)` | `optimizerPlaces` | Mapped from `orderedRows` (DB rows keyed by placeId in request order) | DB-sourced — `default_visit_duration_minutes`, `opening_hours`, `hours_unknown`, `utc_offset_minutes` all read from live columns | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 161 tests pass (total test count matches claim) | `npx vitest run --reporter=verbose 2>&1 \| tail -5` | `Tests 161 passed (161)` | ✓ PASS |
| hoursUnknown places retain slot with warning (Scenario C) | `npx vitest run -t "every hoursUnknown place has hoursUnknown:true in visits output"` | 1 passed, 160 skipped | ✓ PASS |
| Single matrix call enforced | `npx vitest run -t "calls computeRouteMatrix exactly once on the happy path"` | 1 passed, 160 skipped | ✓ PASS |
| Optimizer purity — no I/O in optimizer modules | `grep -n "fetch\|process.env\|from \"@/lib/db\"\|drizzle" src/lib/optimizer/*.ts` (excluding tests and comments) | 0 violations | ✓ PASS |
| No debt markers (TBD/FIXME/XXX) in implementation files | `grep -n "TBD\|FIXME\|XXX" src/lib/optimizer/*.ts src/lib/google/routes-client.ts src/app/api/optimize/route.ts` | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHED-01 | 02-02-PLAN | 系統根據地點總數和遊覽時長，自動建議所需天數 | ✓ SATISFIED | `suggestDayCount()` in schedule.ts; auto-suggestion test in index.test.ts passes |
| SCHED-02 | 02-02-PLAN | 使用者可自行指定旅遊天數（覆蓋自動建議） | ✓ SATISFIED | `numDays` override in `optimize()`; index.test.ts asserts numDays=2 honored, numDays=1 respected |
| SCHED-03 | 02-01-PLAN | 系統根據地理距離最短原則排列同天景點順序 | ✓ SATISFIED | `nearestNeighbor()` + `twoOptImprove()` in route.ts; crossing-fixture improvement asserted in route.test.ts |
| SCHED-04 | 02-01-PLAN + 02-02-PLAN | 系統考慮各地點營業時間，避免排入未開放時段 | ✓ SATISFIED | `isOpenAt()` + `getOpenWindow()` in schedule.ts; Scenario B Monday-closed and 17:00-closer tests pass |
| SCHED-05 | 02-02-PLAN | 系統為每個地點分配具體的到達時間和離開時間 | ✓ SATISFIED | `scheduleTimes()` produces `scheduledStart`/`scheduledEnd` in HH:MM format; contract asserted in scenarios.test.ts |

### Anti-Patterns Found

No blockers or warnings found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `schedule.ts` | 427 | `return null` | ℹ️ Info | Correct sentinel return from `getOpenWindow()` when no period matches the requested day-of-week — not a stub |

### Human Verification Required

None. All must-haves verified programmatically. The phase produces server-side pure logic (no UI rendering) fully covered by unit and integration tests.

### Gaps Summary

No gaps. All 5 success criteria verified against the actual codebase:

- All 10 implementation files exist with substantive content
- All key links are wired (imports present and called)
- Data flows from DB through the optimizer to the response
- 161/161 tests pass across 11 test files
- Purity constraint holds (zero I/O in optimizer modules)
- hoursUnknown rule implemented correctly (slot retained, warning emitted, isOpenAt not consulted)
- unscheduled[] list present in OptimizeResult with placeId + reason per item
- Zod schema enforces max 25 placeIds before any API spend
- computeRouteMatrix called exactly once per optimize request

---

_Verified: 2026-06-26T00:12:00Z_
_Verifier: Claude (gsd-verifier)_
