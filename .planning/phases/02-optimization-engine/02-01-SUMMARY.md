---
phase: 02-optimization-engine
plan: "01"
subsystem: optimizer-core
tags: [optimizer, opening-hours, route-construction, tdd, pure-functions]
status: complete

dependency_graph:
  requires:
    - "01-01: places table schema (opening_hours JSONB, utc_offset_minutes, hours_unknown)"
    - "01-01: OpeningHoursPeriod interface from places-client.ts"
    - "01-01: Vitest test infrastructure scaffolded"
  provides:
    - "OptimizerPlace interface — adapter shape between DB row and optimizer"
    - "TravelMatrix type alias — N×N travel minutes matrix"
    - "OptimizerInput interface — full input bundle for the optimizer service"
    - "isOpenAt() — timezone-correct feasibility predicate (SCHED-04 foundation)"
    - "toLocalMinutes() — UTC epoch → local (dayOfWeek, localMinutes) conversion"
    - "nearestNeighbor() — greedy O(N²) route seed (SCHED-03 foundation)"
    - "twoOptImprove() — 2-opt local search improvement (crossing removal)"
    - "routeTravelTime() — shared cost function for route evaluation"
  affects:
    - "02-02: scheduler uses OptimizerPlace, isOpenAt, nearestNeighbor, twoOptImprove"
    - "02-03: Route Handler passes OptimizerInput to OptimizerService"

tech_stack:
  added: []
  patterns:
    - "Pure function modules (zero HTTP, zero DB, zero process.env)"
    - "TDD RED→GREEN flow with co-located Vitest test files"
    - "Minutes-of-week arithmetic for midnight-crossing period handling"
    - "2-opt local search with early-exit on convergence"

key_files:
  created:
    - src/lib/optimizer/types.ts
    - src/lib/optimizer/opening-hours.ts
    - src/lib/optimizer/opening-hours.test.ts
    - src/lib/optimizer/route.ts
    - src/lib/optimizer/route.test.ts
  modified: []

decisions:
  - "Re-export OpeningHoursPeriod from places-client.ts (single canonical definition, no drift)"
  - "Minutes-of-week (0–10079) as the comparison domain for midnight-crossing — eliminates day-boundary if/else complexity"
  - "isOpenAt returns false for empty periods (Pitfall 3 compliance) — hoursUnknown policy lives in scheduler (02-02)"
  - "toLocalMinutes uses pure epoch arithmetic (no date-fns-tz or Luxon required for this calculation)"
  - "twoOptImprove default passes=4 (CONTEXT.md guidance: 3-5); early-exit when no improvement in a full pass"
  - "routeTravelTime is an open path (no return-to-origin) — itineraries end at the last stop"

metrics:
  duration_minutes: 5
  completed_date: "2026-06-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 02 Plan 01: Optimizer Core Types + Opening-Hours Predicate + Route Construction Summary

**One-liner:** Pure-function optimizer core with timezone-correct `isOpenAt()` predicate (UTC-epoch arithmetic, midnight-crossing support) and `nearestNeighbor` + `twoOptImprove` route construction, all TDD with 22 assertions across 2 test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | isOpenAt + toLocalMinutes test suite | 5430b2e | opening-hours.test.ts |
| 1 (GREEN) | types.ts + opening-hours.ts implementation | aa400a6 | types.ts, opening-hours.ts |
| 2 (RED) | Route construction test suite | 042a6e4 | route.test.ts |
| 2 (GREEN) | route.ts implementation | 9be1933 | route.ts |

## Verification Results

- `npx vitest run src/lib/optimizer/` — **22/22 tests pass** across 2 test files
- `npx tsc --noEmit` — **clean** (zero type errors)
- Grep gate (purity constraint): **0 violations** — no `fetch(`, `process.env`, `from "@/lib/db"`, or `drizzle` in non-comment implementation lines

### Test Coverage Summary

**opening-hours.test.ts (11 assertions):**
- `isOpenAt`: Mon-Fri open at 10:00 → true
- `isOpenAt`: Mon-Fri before open 08:00 → false
- `isOpenAt`: Mon-Fri after close 18:00 → false
- `isOpenAt`: Sat-Sun only, queried Monday → false
- `isOpenAt`: midnight-crossing Fri 22:00–Sat 02:00, queried Sat 01:00 → true
- `isOpenAt`: midnight-crossing, queried outside window (Sat 03:00) → false
- `isOpenAt`: 24h (no close field) at any minute → true
- `isOpenAt`: open==close convention (all-day) → true
- `isOpenAt`: empty periods → false (Pitfall 3 compliance)
- `toLocalMinutes`: UTC+8, 2026-06-29T01:00Z → Monday 09:00 (day=1, min=540)
- `toLocalMinutes`: null offset → UTC+0, no throw

**route.test.ts (11 assertions):**
- `routeTravelTime`: sum of consecutive legs [0,1,2]=30
- `routeTravelTime`: single-node order → 0
- `routeTravelTime`: order-sensitive (different orders differ)
- `nearestNeighbor`: N-length permutation, no duplicates (Set size === N)
- `nearestNeighbor`: starts at given startIndex
- `nearestNeighbor`: greedy picks on unambiguous matrix → exact [0,1,2,3]
- `nearestNeighbor`: 2-node matrix handled correctly
- `twoOptImprove`: strictly improves known-crossing route [0,2,1,3]
- `twoOptImprove`: never worsens any seed (monotone guarantee)
- `twoOptImprove`: output is valid permutation of same index set
- `twoOptImprove`: returns optimal-or-equal when no improvement possible

## Decisions Made

1. **Re-export `OpeningHoursPeriod` from `places-client.ts`** — single canonical shape shared between places client and optimizer. No duplication, no drift risk.

2. **Minutes-of-week (0–10079) as comparison domain** — `period.open.day * 1440 + hour * 60 + minute`. This collapses midnight-crossing into a simple branch: if `closeMow < openMow`, the window wraps the week boundary. No day-boundary edge cases to special-case.

3. **`isOpenAt` returns `false` for empty periods** — per Pitfall 3: the "always open if hours unknown" policy belongs in the scheduler (Plan 02), not in the predicate. This keeps the predicate single-responsibility.

4. **Pure epoch arithmetic in `toLocalMinutes`** — `(utcEpochMs + offsetMs) / 60_000 % 1440` gives local minutes. `(days % 7 + 4 + 7) % 7` gives day-of-week (Thursday = Unix epoch day 4). No external library needed; T-02-02 mitigation fulfilled by unit tests.

5. **`twoOptImprove` passes=4, early-exit** — default matches CONTEXT.md guidance (3-5 passes). Early-exit when a full pass produces no improvement keeps the wall-clock time minimal for already-optimal small inputs.

6. **Open path (no return-to-origin)** — `routeTravelTime` sums legs 0→1, 1→2, …, N-2→N-1. Itineraries end at the last destination; users don't need a loop back to origin.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met on first implementation attempt.

## TDD Gate Compliance

- RED gate (test commit): `test(02-01): add failing tests for isOpenAt...` → 5430b2e
- GREEN gate (implementation commit): `feat(02-01): implement types.ts and isOpenAt...` → aa400a6
- RED gate (test commit): `test(02-01): add failing tests for nearestNeighbor...` → 042a6e4
- GREEN gate (implementation commit): `feat(02-01): implement nearestNeighbor...` → 9be1933

Both RED→GREEN cycles completed. No REFACTOR phase needed (code is already clean).

## Known Stubs

None — all functions are fully implemented with no placeholder returns or TODO stubs.

## Threat Flags

No new security surface introduced. This plan contains only pure in-process functions with no network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- [x] `src/lib/optimizer/types.ts` — exists, exports `OptimizerPlace`, `TravelMatrix`, `OptimizerInput`, `OpeningHoursPeriod`
- [x] `src/lib/optimizer/opening-hours.ts` — exists, exports `isOpenAt`, `toLocalMinutes`
- [x] `src/lib/optimizer/opening-hours.test.ts` — exists, 11 tests green
- [x] `src/lib/optimizer/route.ts` — exists, exports `routeTravelTime`, `nearestNeighbor`, `twoOptImprove`
- [x] `src/lib/optimizer/route.test.ts` — exists, 11 tests green
- [x] Commits 5430b2e, aa400a6, 042a6e4, 9be1933 — all present in git log
- [x] `npx tsc --noEmit` — clean
- [x] Purity grep gate — 0 non-comment I/O violations
