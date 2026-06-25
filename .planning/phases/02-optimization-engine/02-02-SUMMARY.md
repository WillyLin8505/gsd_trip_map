---
phase: 02-optimization-engine
plan: "02"
subsystem: optimizer-scheduler
tags: [optimizer, scheduling, day-splitting, opening-hours, tdd, pure-functions, scenario-tests]
status: complete

dependency_graph:
  requires:
    - "02-01: OptimizerPlace, TravelMatrix, OptimizerInput (types.ts)"
    - "02-01: isOpenAt, toLocalMinutes (opening-hours.ts)"
    - "02-01: nearestNeighbor, twoOptImprove, routeTravelTime (route.ts)"
  provides:
    - "minutesToHHMM() — zero-padded HH:MM string from minutes since midnight"
    - "suggestDayCount() — auto day-count from durations + avg travel (SCHED-01)"
    - "splitIntoDays() — greedy bin-packing into N day buckets with overflow list (SCHED-02)"
    - "scheduleTimes() — HH:MM time assignment respecting opening hours (SCHED-04/05)"
    - "OptimizeResult interface — locked to 02-CONTEXT.md API contract"
    - "ScheduledVisit interface — locked to 02-CONTEXT.md API contract"
    - "optimize() — full pipeline orchestrator (nearestNeighbor→2-opt→split→schedule)"
  affects:
    - "02-03: Route Handler imports optimize() from index.ts and OptimizeResult for response shape"

tech_stack:
  added: []
  patterns:
    - "Pure function modules (zero HTTP, zero DB, zero process.env) — all I/O via arguments/return values"
    - "TDD RED→GREEN flow with co-located Vitest test files"
    - "Greedy bin-packing for day-splitting (accumulate duration+travel, flush on overflow)"
    - "hoursUnknown policy: slot retained + warning emitted; isOpenAt NOT consulted (Pitfall 3)"
    - "Day-of-week from ISO date + dayOffset via UTC arithmetic (no timezone library)"
    - "Open-window extraction via getOpenWindow() — same-day, midnight-crossing, 24h"

key_files:
  created:
    - src/lib/optimizer/schedule.ts
    - src/lib/optimizer/schedule.test.ts
    - src/lib/optimizer/index.ts
    - src/lib/optimizer/index.test.ts
    - src/lib/optimizer/scenarios.test.ts
  modified: []

decisions:
  - "getOpenWindow() extracts openTime/closeTime from periods for a specific dayOfWeek — separate from isOpenAt() to get concrete minute values for arithmetic (isOpenAt only returns boolean)"
  - "scheduleTimes marks closed-day places as unscheduled immediately; time clock still advances to avoid compounding errors for subsequent places"
  - "overflow from splitIntoDays merged into unscheduled[] in optimize() with reason '行程天數不足'"
  - "nextMonday() uses UTC arithmetic only — no Intl, no Date.getDay() (DST-safe)"
  - "splitIntoDays uses null sentinel for currentDay to signal overflow mode (avoids double-commit bug)"

metrics:
  duration_minutes: 7
  completed_date: "2026-06-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 02 Plan 02: Day Scheduling + optimize() Orchestrator Summary

**One-liner:** Greedy bin-packing day-splitter + opening-hours-aware HH:MM scheduler + `optimize()` orchestrator (nearestNeighbor→2-opt→split→schedule), all TDD with 73 total assertions across 5 test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | schedule.ts test suite | ea95775 | schedule.test.ts |
| 1 (GREEN) | schedule.ts implementation | 0bfeb17 | schedule.ts |
| 2 (RED) | index.ts + scenarios.test.ts test suites | 76d50ef | index.test.ts, scenarios.test.ts |
| 2 (GREEN) | index.ts implementation | 7f42d01 | index.ts |

## Verification Results

- `npx vitest run src/lib/optimizer/` — **73/73 tests pass** across 5 test files
- `npx tsc --noEmit` — **clean** (zero type errors)
- Purity gate: **0 actual violations** — all grep matches are JSDoc comment text only; no `fetch(`, `process.env`, `from "@/lib/db"`, or `drizzle` in executable code
- Contract gate: scenarios.test.ts asserts all required fields: `suggestedDays`, `days[].dayNumber`, `days[].visits[].{placeId,displayName,scheduledStart,scheduledEnd,travelFromPrevMinutes,waitMinutes,hoursUnknown}`, `unscheduled[].{placeId,reason}`

### Test Coverage Summary

**schedule.test.ts (26 assertions):**
- `minutesToHHMM`: 540→"09:00", 1290→"21:30", 0→"00:00", 61→"01:01", 1439→"23:59"
- `suggestDayCount`: single place→1, tiny input→1, 5×60+zero travel→1, custom budget, uses avg travel
- `splitIntoDays`: 5 places in 1 bucket, numDays bucket limit, new day on overflow, numDays=1 forced overflow, travel time included in overflow check
- `scheduleTimes`: day-start with travelFromPrev=0, arrivalTime arithmetic, waitMinutes on late open, unscheduled on exceeds-close, hoursUnknown keeps slot+warning, closed-day unscheduled, HH:MM strings, 1-based dayNumber

**index.test.ts (23 assertions):**
- Auto-suggestion (SCHED-01): suggestedDays=1 for 4×60 min zero-travel
- Override (SCHED-02): numDays=2 honored in output, numDays=1 respected
- Conservation: all 5 places in days∪unscheduled, no loss/duplication; holds with overflow
- Pipeline order: 2-opt crossing-fixture improvement verified in visit order
- Contract presence: suggestedDays/days/unscheduled, dayNumber/visits, all visit fields, unscheduled fields

**scenarios.test.ts (24 assertions):**
- Scenario A (N=5, 09:00-18:00): 1-2 days, empty unscheduled, all ends ≤18:00, conservation
- Scenario B (N=10 mixed): Monday-closed place in unscheduled, 17:00-closer never past 17:00, 10/10 accounted for
- Scenario C (N=20 hoursUnknown): no throw, 20/20 accounted for, all 6 hoursUnknown places have flag+warning and are in visits (not unscheduled)

## Decisions Made

1. **`getOpenWindow()` as a separate helper from `isOpenAt()`** — `isOpenAt` returns a boolean (enough for feasibility checks in Plan 01). The scheduler needs the actual `openTime`/`closeTime` minutes for arithmetic (`scheduledStart = max(arrival, openTime)`). Extracting a separate `getOpenWindow()` avoids re-implementing period parsing twice.

2. **hoursUnknown path in scheduleTimes completely bypasses `isOpenAt`** — per Pitfall 3: consulting `isOpenAt` with null/empty periods returns `false`, which would incorrectly send the place to `unscheduled[]`. The hoursUnknown branch is a `continue` that short-circuits before any period lookup.

3. **Time clock advances even for unscheduled places** — When a place is pushed to unscheduled (closed day or exceeds-close), the running time clock still advances by `arrivalTime + visitDuration`. This keeps subsequent places correctly positioned rather than compounding early-arrival errors.

4. **splitIntoDays uses null sentinel for overflow mode** — After all `numDays` buckets are filled, `currentDay` is set to `null`. The loop then immediately overflows subsequent indices without evaluating any bin-packing logic. This eliminates a class of bugs where the last partially-built day was double-committed.

5. **nextMonday() uses UTC arithmetic** — No `Date.getDay()` (DST-sensitive). Pure UTC millisecond offset from today's midnight to next Monday. Consistent across all timezones.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed splitIntoDays null-sentinel logic**
- **Found during:** Task 1 GREEN implementation — first run had 1 test failing
- **Issue:** When `dayOrders.length >= numDays` and overflow mode triggered, `currentDay` was still pointing to the old array that had already been pushed to `dayOrders`. On the end-of-loop commit, this array was attempted to be pushed again.
- **Fix:** Changed `currentDay` from `number[]` to `number[] | null`, using `null` as an overflow-mode sentinel. The loop checks `if (currentDay === null)` at entry and immediately overflows without any bin-packing evaluation.
- **Files modified:** src/lib/optimizer/schedule.ts
- **Commit:** 0bfeb17 (GREEN commit, same task — fixed during GREEN phase before task commit)

## TDD Gate Compliance

- RED gate (test commit): `test(02-02): add failing tests for schedule.ts...` → ea95775
- GREEN gate (implementation commit): `feat(02-02): implement schedule.ts...` → 0bfeb17
- RED gate (test commit): `test(02-02): add failing tests for optimize() orchestrator...` → 76d50ef
- GREEN gate (implementation commit): `feat(02-02): implement optimize() orchestrator in index.ts` → 7f42d01

Both RED→GREEN cycles completed. No REFACTOR phase needed.

## Known Stubs

None — all functions are fully implemented. `optimize()` is wired end-to-end and the three scenario tests exercise the full path with mock data.

## Threat Flags

No new security surface introduced. All functions in this plan are pure in-process functions with no network endpoints, auth paths, file access patterns, or schema changes. Threat mitigations T-02-03, T-02-04, T-02-05 from the plan's threat register are all covered by unit tests (Scenario C for T-02-03, conservation invariant for T-02-04, numDays override test for T-02-05).

## Self-Check: PASSED

- [x] `src/lib/optimizer/schedule.ts` — exists, exports `minutesToHHMM`, `suggestDayCount`, `splitIntoDays`, `scheduleTimes`, `ScheduledVisit`, `OptimizeResult`
- [x] `src/lib/optimizer/schedule.test.ts` — exists, 26 tests green
- [x] `src/lib/optimizer/index.ts` — exists, exports `optimize`, re-exports `OptimizeResult`, `ScheduledVisit`
- [x] `src/lib/optimizer/index.test.ts` — exists, 23 tests green
- [x] `src/lib/optimizer/scenarios.test.ts` — exists, 24 tests green
- [x] Commits ea95775, 0bfeb17, 76d50ef, 7f42d01 — all present in git log
- [x] `npx tsc --noEmit` — clean
- [x] Purity gate — 0 executable-code I/O violations (only JSDoc comment mentions)
- [x] 73/73 total optimizer tests pass (5 test files)
