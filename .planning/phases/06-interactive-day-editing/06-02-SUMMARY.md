---
phase: 06-interactive-day-editing
plan: "02"
subsystem: optimizer-day-editing-f2
tags: [f2-auto-arrange, classifyPlace, meal-slotting, tdd, phase6]
status: complete

dependency_graph:
  requires:
    - 06-01 (scheduleSingleDay reorder=false, POST /api/optimize/day route, DayCard.onAutoArrange, replaceDay, handleAutoArrange)
    - 02-optimizer (scheduleTimes, nearestNeighbor, twoOptImprove, TravelMatrix)
  provides:
    - classifyPlace (pure 3-category classifier: 餐廳/點心/行程)
    - scheduleSingleDay reorder=true (A-submatrix NN+2-opt + clock-walk meal insertion)
    - placeTypes field on OptimizerPlace (optional, threaded from DB in day route)
  affects:
    - src/lib/optimizer/day.ts (classifyPlace + reorder=true branch)
    - src/lib/optimizer/types.ts (OptimizerPlace.placeTypes? optional field)
    - src/app/api/optimize/day/route.ts (placeTypes threaded to OptimizerPlace)
    - src/lib/optimizer/day.test.ts (24 tests: 14 classifyPlace + 5 reorder=true + 5 reorder=false)
    - src/app/api/optimize/day/route.test.ts (16 tests: +2 reorder=true happy path)

tech_stack:
  added: []
  patterns:
    - A-submatrix index mapping: aMatrix[a][b]=matrix[A[a]][A[b]]; nnResult.map(i=>A[i]) back to full indices (Pitfall 6)
    - Clock-walk pre-simulation: ONLY matrix travel + visitDurationMinutes (Pitfall 8 — no opening-hours)
    - scheduleTimes delegation: all opening-hours correctness in scheduleTimes, not clock-walk
    - classifyPlace allowlist: RESTAURANT_TYPES/SNACK_TYPES Sets; restaurant wins ties; null→attraction (T-06-06)
    - OptimizerPlace.placeTypes optional field: zero breaking changes to existing optimizer code

key_files:
  modified:
    - src/lib/optimizer/day.ts
    - src/lib/optimizer/day.test.ts
    - src/lib/optimizer/types.ts
    - src/app/api/optimize/day/route.ts
    - src/app/api/optimize/day/route.test.ts

decisions:
  - classifyPlace accesses p.placeTypes on OptimizerPlace (optional field) rather than a pre-classification step — minimal interface change
  - placeTypes optional (not required) in OptimizerPlace so existing /api/optimize route needs no changes
  - Clock-walk advances currentTime through both bestR.visitDuration + matrix[bestR][idx] + idx.visitDuration when meal slot triggers — approximation for insertion point; exact times from scheduleTimes
  - A.length=1 case handled specially (skip NN+2-opt, trivial single-element array) to avoid 1x1 matrix edge cases
  - UI wiring (DayCard.onAutoArrange, place-input-panel.handleAutoArrange, ResultsLayout/ItineraryView forwarding) confirmed complete from 06-01 — no re-work needed

metrics:
  duration: "~8 minutes"
  completed: "2026-06-26T17:28:23Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 0
  files_modified: 5
---

# Phase 06 Plan 02: F2 Auto-Arrange Day Summary

**One-liner:** `classifyPlace` pure allowlist + `scheduleSingleDay(reorder=true)` A-submatrix NN+2-opt clock-walk — restaurants slotted into lunch/dinner windows with index mapping via `aOrder.map(i => A[i])`.

## Objective

Deliver F2 vertical slice (EDIT-02): `classifyPlace` 3-category taxonomy + `scheduleSingleDay(reorder=true)` shortest-path reorder with meal slotting, extending the F1 primitives from 06-01.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | classifyPlace + scheduleSingleDay(reorder=true) — TDD RED→GREEN | 2dbcc35 | day.ts, day.test.ts, types.ts, route.ts |
| 2 | reorder=true route test + F2 wiring verified | 25ffa72 | route.test.ts |
| 3 | Human verify — F2 browser walkthrough | DEFERRED | (see §Deferred Human Verification) |

## Deviations from Plan

None — plan executed exactly as written. All pitfalls honored:

- **Pitfall 6** (A-submatrix index mapping): `aMatrix[a][b]=matrix[A[a]][A[b]]`; `aOrder.map(i=>A[i])` maps back to full indices before `scheduleTimes`.
- **Pitfall 8** (clock-walk no opening-hours): pre-simulation uses ONLY `matrix[i][j] + visitDurationMinutes`; `scheduleTimes` owns opening-hours correctness.
- **Pitfall 4** (null place_types): `classifyPlace(p.placeTypes ?? null)` → "attraction" safely.
- **T-06-06** (place_types classification security): pure allowlist over fixed Sets; null/unknown default to "attraction" (least privileged).

## Known Stubs

None — F2 auto-arrange is fully implemented end-to-end. The stub from 06-01 (`scheduleSingleDay reorder=true throws`) is replaced with the real implementation.

## v1 Known Limitation

`durationOverrides` is omitted from the day route request body (inherited from 06-01). See 06-01-SUMMARY.md §v1 Known Limitation.

## Deferred Human Verification (Task 3)

**What to verify (browser walkthrough):**

1. Generate a multi-day itinerary that includes at least one day with ≥1 restaurant (餐廳) and some attractions/snacks.
2. Click 「自動安排」 on that day. Confirm:
   - Only that day re-orders (shortest path via NN+2-opt)
   - Restaurant(s) land in the 11:30–13:30 (lunch) and/or 17:30–19:30 (dinner) windows
   - 點心 + 行程 sit as ordinary route stops (not in meal windows)
   - Other days are unchanged
   - The map polyline/marker order for that day updates
3. Click 「自動安排」 on a day with 0 restaurants. Confirm it succeeds as plain shortest-path with no meal slotting and no error.
4. (If reproducible) Induce a failure (e.g., kill server briefly). Confirm the inline 「自動安排失敗，請稍後再試」 alert appears under that day and the day is left intact (not wiped).

**Resume signal:** Type "approved" or describe issues.

## Test Results

```
Test Files  27 passed (27)
     Tests  273 passed (273)
  Duration  2.62s
```

TypeScript: `npx tsc --noEmit` — no errors.

New tests from this plan:
- `src/lib/optimizer/day.test.ts`: 24 tests total (was 6; +14 classifyPlace + 5 reorder=true real cases; removed 1 stub throw test)
- `src/app/api/optimize/day/route.test.ts`: 16 tests total (was 14; +2 reorder=true happy path)

## Threat Surface Scan

No new security surface beyond the planned threat model:
- T-06-06 (Tampering via place_types classification): mitigated — `classifyPlace` uses pure Set allowlists; null/unknown safely maps to "attraction" (no privileged meal-slot behaviour).
- T-06-02 (GOOGLE_PLACES_API_KEY): unchanged — key read only from `process.env` server-side; placeTypes comes from DB, not the response.
- No new network endpoints, auth paths, or schema changes introduced.

## Self-Check

### Files modified:
- [x] `src/lib/optimizer/day.ts` — FOUND (classifyPlace exported, reorder=true implemented)
- [x] `src/lib/optimizer/day.test.ts` — FOUND (24 tests)
- [x] `src/lib/optimizer/types.ts` — FOUND (placeTypes? optional field)
- [x] `src/app/api/optimize/day/route.ts` — FOUND (placeTypes threaded)
- [x] `src/app/api/optimize/day/route.test.ts` — FOUND (16 tests)

### Commits:
- [x] 2dbcc35 — feat(06-02): classifyPlace + scheduleSingleDay(reorder=true) meal-slotting
- [x] 25ffa72 — feat(06-02): reorder=true route test + verified F2 end-to-end wiring

## Self-Check: PASSED
