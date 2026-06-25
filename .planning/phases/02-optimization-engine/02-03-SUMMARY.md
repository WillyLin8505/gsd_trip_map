---
phase: 02-optimization-engine
plan: "03"
subsystem: routes-api-client + optimize-route-handler
tags: [routes-api, route-handler, zod-validation, tdd, purity-boundary, drizzle, travel-matrix]
status: complete

dependency_graph:
  requires:
    - "02-01: OptimizerPlace, TravelMatrix, OptimizerInput (types.ts)"
    - "02-02: optimize() orchestrator (index.ts), OptimizeResult, ScheduledVisit (schedule.ts)"
    - "01: places table (schema.ts), db client (drizzle), GOOGLE_PLACES_API_KEY env var"
    - "01: durationForTypes (duration-table.ts)"
  provides:
    - "computeRouteMatrix(coords, apiKey) — single Routes API call returning N×N minute matrix"
    - "ROUTES_MATRIX_FIELD_MASK = 'originIndex,destinationIndex,duration,condition'"
    - "RouteMatrixCoord interface — {lat, lng}"
    - "optimizeRequestSchema (Zod) — placeIds max 25, numDays positive int, travelDate ISO"
    - "OptimizeRequest type"
    - "POST /api/optimize — full end-to-end vertical slice (SCHED-01..05)"
  affects:
    - "Phase 3 UI: can POST placeIds → receive day-by-day schedule for rendering"

tech_stack:
  added: []
  patterns:
    - "TDD RED→GREEN flow with co-located Vitest test files"
    - "vi.mock hoisting for db + routes-client; real optimize() used in integration test"
    - "Explicit apiKey parameter (never process.env inside pure modules — T-02-08)"
    - "Number.MAX_SAFE_INTEGER sentinel for Routes API unreachable pairs (not 0)"
    - "Zod schema max(25) cap as DoS/cost guard before any Routes API spend (T-02-07)"
    - "422 with explicit missingIds list for unresolved placeIds (T-02-09: no silent drop)"
    - "inArray(places.place_id, placeIds) — parameterized Drizzle query, no raw SQL"

key_files:
  created:
    - src/lib/google/routes-client.ts
    - src/lib/google/routes-client.test.ts
    - src/lib/validation/optimize.ts
    - src/app/api/optimize/route.ts
    - src/app/api/optimize/route.test.ts
  modified: []

decisions:
  - "Number.MAX_SAFE_INTEGER sentinel (not 0) for unreachable Routes API pairs — ensures optimizer never treats an infeasible pair as zero-cost travel"
  - "Ordered rows by placeIds input order (not DB order) so matrix[i][j] aligns with OptimizerPlace[i]→OptimizerPlace[j]"
  - "422 (Unprocessable Entity) for unresolved placeIds — more semantically correct than 400 (bad syntax); matches T-02-09 mitigation requirement"
  - "GOOGLE_PLACES_API_KEY reused for Routes API — same GCP project as Places, single env var (per 02-CONTEXT.md user_setup)"
  - "durationForTypes() fallback when default_visit_duration_minutes is null — handles text-resolved places that haven't been through /api/places/details"

metrics:
  duration_minutes: 8
  completed_date: "2026-06-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
---

# Phase 02 Plan 03: Routes API Client + POST /api/optimize Route Handler Summary

**One-liner:** Google Routes API computeRouteMatrix client (N×N minute matrix, sentinel for unreachable pairs) + POST /api/optimize Route Handler wiring DB load → single matrix call → pure optimize() → locked response contract, TDD with 30 total assertions across 2 test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | routes-client.test.ts — 15 failing tests | 2c5dba1 | routes-client.test.ts |
| 1 (GREEN) | routes-client.ts implementation | c565faf | routes-client.ts |
| 2 (RED) | route.test.ts — 15 failing tests | 4cebd23 | route.test.ts |
| 2 (GREEN) | optimize.ts + route.ts implementation | 3fe1214 | route.ts, optimize.ts |

## Verification Results

- `npx vitest run` — **161/161 tests pass** across 11 test files (30 new in this plan; 131 from previous plans)
- `npx tsc --noEmit` — **clean** (zero type errors)
- Single-matrix-call gate: route.test.ts asserts `computeRouteMatrix` mock `toHaveBeenCalledTimes(1)` on the happy path (line 339)
- Purity gate: all 3 grep matches in `src/lib/optimizer/` are JSDoc comment lines (` * `-prefixed); zero executable-code I/O violations
- Contract gate: happy-path test asserts `suggestedDays`, `days[].dayNumber`, `days[].visits[].{placeId,displayName,scheduledStart,scheduledEnd,travelFromPrevMinutes,waitMinutes,hoursUnknown}`, `unscheduled[].{placeId,reason}` — all matching 02-CONTEXT.md

### Test Coverage Summary

**routes-client.test.ts (15 assertions):**
- Request URL contains `routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`
- `X-Goog-FieldMask` header equals `ROUTES_MATRIX_FIELD_MASK`
- `X-Goog-Api-Key` header set to passed apiKey
- `origins.length === N` and `destinations.length === N` for N coords
- `travelMode: "DRIVE"` in request body
- Returns N×N matrix; diagonal entries === 0
- Converts seconds to minutes (Math.round) — 600s→10min, 90s→2min
- 3×3 matrix fully parsed with all ROUTE_EXISTS pairs
- `Number.MAX_SAFE_INTEGER` for missing element (never in response)
- `Number.MAX_SAFE_INTEGER` for `ROUTE_NOT_FOUND` condition
- Unreachable pair sentinel is never 0
- Throws Error containing HTTP status on 403 / 500 responses
- `ROUTES_MATRIX_FIELD_MASK` contains all 4 required fields

**route.test.ts (15 assertions):**
- Missing placeIds → 400, db not called, computeRouteMatrix not called
- Empty placeIds array → 400
- numDays=0 → 400; numDays=1.5 (float) → 400
- 26 placeIds → 400 (T-02-07 DoS cap)
- Invalid JSON body → 400
- One of two placeIds missing from cache → 422 listing the missing ID; computeRouteMatrix not called
- All placeIds missing → 422 listing all missing IDs
- Missing GOOGLE_PLACES_API_KEY → 500 with config error message
- Happy path (5 places): 200 with suggestedDays/days/unscheduled; conservation; visit contract fields; HH:MM format
- computeRouteMatrix called exactly once (single-matrix-call gate)
- apiKey passed correctly to computeRouteMatrix
- visitDurationMinutes=90 from DB produces 09:00–10:30 schedule
- hoursUnknown=true from DB column emits warning in visit
- computeRouteMatrix throws → 502 response

## Decisions Made

1. **`Number.MAX_SAFE_INTEGER` sentinel for unreachable pairs** — The Routes API may not return elements for every (origin, destination) pair (island-like POIs, ferry-only routes). The matrix must never treat these as 0-cost travel since that would cause the optimizer to wrongly prefer isolated destinations. Sentinel ensures they are always the highest-cost option and get deprioritized.

2. **Rows ordered by placeIds input order** — The DB `inArray` query returns rows in an arbitrary order (not necessarily matching the `placeIds` input array). The handler builds a `rowMap` keyed on `place_id` and re-orders to `placeIds` order. This guarantees `matrix[i][j]` aligns with `OptimizerPlace[i]→OptimizerPlace[j]`.

3. **422 for unresolved placeIds** — 400 (Bad Request) would imply the request is syntactically malformed. 422 (Unprocessable Entity) is more accurate: the request is valid JSON with a valid schema, but the semantic content references data that doesn't exist in the cache. The error body lists the specific missing IDs so callers know exactly what to resolve first (T-02-09 mitigation).

4. **`GOOGLE_PLACES_API_KEY` reused for Routes API** — Per 02-CONTEXT.md `user_setup`: the same GCP server key (already created in Phase 1 with Places API) must additionally have Routes API enabled. One key, one env var, same billing account. This avoids adding a second env var for what is structurally the same secret.

5. **`durationForTypes()` fallback in DB mapping** — If a place was resolved via POST /api/places/resolve (text search only, no detail fetch), `default_visit_duration_minutes` may be null. The handler falls back to `durationForTypes(row.place_types ?? [])` so the optimizer always receives a valid duration without requiring the caller to pre-fetch details.

## Deviations from Plan

None — plan executed exactly as written. The only deviation worth noting is a clarification: the grep purity gate command in the plan (`grep -vc '//'`) counts 3 matches — all are JSDoc comment lines in `* This module is intentionally PURE` blocks. Verified by running `grep | grep -v '//'` which returns the same 3 lines; each starts with ` * ` (block comment content). Zero executable I/O violations.

## TDD Gate Compliance

- RED gate (test commit): `test(02-03): add failing tests for computeRouteMatrix routes-client` → 2c5dba1
- GREEN gate (implementation commit): `feat(02-03): implement computeRouteMatrix Routes API client` → c565faf
- RED gate (test commit): `test(02-03): add failing tests for POST /api/optimize route handler` → 4cebd23
- GREEN gate (implementation commit): `feat(02-03): implement Zod schema + POST /api/optimize route handler` → 3fe1214

Both RED→GREEN cycles completed. No REFACTOR phase needed.

## Known Stubs

None — all functions are fully implemented. The Route Handler is wired end-to-end and the happy-path test exercises the full path (DB mock → matrix mock → real optimize() → 200 response with conservation assertion).

## Threat Flags

No new security surface beyond what the plan's threat model covers.

| Flag | File | Description |
|------|------|-------------|
| (none) | — | All endpoints and key handling match the 02-CONTEXT.md threat register |

Mitigations T-02-06 through T-02-09 are all implemented and asserted in tests:
- T-02-06: Zod `inArray` parameterized query — validated
- T-02-07: `placeIds.max(25)` Zod cap + 400 on 26 placeIds — test passes
- T-02-08: `GOOGLE_PLACES_API_KEY` from `process.env` only in Route Handler; never returned in response — verified by test asserting 500 when unset
- T-02-09: 422 with explicit `details: missingIds` — test asserts `body.details` contains missing ID

## Self-Check: PASSED

- [x] `src/lib/google/routes-client.ts` — exists, exports `computeRouteMatrix`, `ROUTES_MATRIX_FIELD_MASK`, `RouteMatrixCoord`
- [x] `src/lib/google/routes-client.test.ts` — exists, 15 tests green
- [x] `src/lib/validation/optimize.ts` — exists, exports `optimizeRequestSchema`, `OptimizeRequest`, `OptimizeErrorResponse`
- [x] `src/app/api/optimize/route.ts` — exists, exports `POST`
- [x] `src/app/api/optimize/route.test.ts` — exists, 15 tests green
- [x] Commits 2c5dba1, c565faf, 4cebd23, 3fe1214 — all present in git log
- [x] `npx tsc --noEmit` — clean
- [x] `npx vitest run` — 161/161 tests pass (11 test files)
- [x] Single-matrix-call gate — `computeRouteMatrix` mock asserted `toHaveBeenCalledTimes(1)`
- [x] Purity gate — 0 executable-code I/O violations in `src/lib/optimizer/`
- [x] Contract gate — 200 response has `suggestedDays`, `days`, `unscheduled` with all locked fields
