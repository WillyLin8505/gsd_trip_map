---
phase: 01-foundation-api-integration
plan: "03"
subsystem: api
tags: [google-places, cache, drizzle, vitest, tdd, enterprise-sku, opening-hours, visit-duration]

requires:
  - 01-01 (places-client.ts textSearch() patterns and ESSENTIALS_FIELD_MASK; places table schema; db client)
  - 01-02 (full schema with all 4 tables; Supabase clients; service-role RLS for places writes)

provides:
  - durationForTypes() — visit duration lookup from Google place types (Phase 2 optimizer input)
  - placeDetails() — Google Places API (New) Enterprise field mask client with hours_unknown rule
  - DETAILS_FIELD_MASK — separately auditable from ESSENTIALS_FIELD_MASK
  - GET /api/places/details — cache-first (30-day TTL) endpoint returning full place data

affects:
  - 01-04-PLAN (URL resolution endpoint uses same places cache)
  - Phase 2 optimizer (depends on durationForTypes() and GET /api/places/details response shape)
  - All itinerary planning (hours_unknown rule prevents incorrect always-open scheduling)

tech-stack:
  added: []
  patterns:
    - "DETAILS_FIELD_MASK constant separated from ESSENTIALS_FIELD_MASK for independent auditability"
    - "hours_unknown rule: absent regularOpeningHours -> hoursUnknown=true, openingHours=null (never always-open)"
    - "Cache-first: Drizzle WHERE place_id AND updated_at > now()-30days before any Google API call"
    - "onConflictDoUpdate on place_id refreshes all detail columns and updated_at on cache miss"
    - "durationForTypes() priority-table approach: first matching type wins (cafe before food group)"
    - "TDD: RED commit then GREEN commit for Tasks 1 and 2"

key-files:
  created:
    - src/lib/places/duration-table.ts
    - src/lib/places/duration-table.test.ts
    - src/lib/google/place-details.test.ts
    - src/app/api/places/details/route.ts
  modified:
    - src/lib/google/places-client.ts

key-decisions:
  - "DETAILS_FIELD_MASK exported as a separate constant (not merged into ESSENTIALS_FIELD_MASK) so each can be audited and changed independently without risk of cross-contamination"
  - "Priority-ordered lookup table for durationForTypes() ensures cafe/coffee_shop (30 min) wins over the broader food group (60 min) regardless of type array order"
  - "cache=true flag in response shape lets callers distinguish cache hits from fresh Google fetches without re-querying the DB"
  - "parsePriceLevel() maps Google PRICE_LEVEL_* enum strings to integers for DB storage consistency"

metrics:
  duration: 6min
  completed: "2026-06-25"
  tasks_completed: 3
  files_modified: 5
  tests_added: 42

status: complete
---

# Phase 01 Plan 03: Cache-First Place Details Summary

**Enterprise-field-masked Place Details client with hours_unknown rule, visit-duration lookup table, and cache-first GET /api/places/details endpoint enforcing a 30-day TTL — satisfying Success Criterion 2 (second lookup served from cache without a Google API call)**

## Performance

- **Duration:** ~6 minutes
- **Completed:** 2026-06-25
- **Tasks:** 3 (Tasks 1 and 2 via TDD RED/GREEN)
- **Files modified:** 5

## Accomplishments

- `durationForTypes()` maps Google place types to default visit minutes using a priority-ordered table (27 unit tests cover all 8 type groups, fallback, and precedence edge cases)
- `placeDetails()` fetches from `places.googleapis.com/v1/places/{placeId}` with `DETAILS_FIELD_MASK` (separate from `ESSENTIALS_FIELD_MASK`); enforces the hours_unknown rule — absent `regularOpeningHours` → `hoursUnknown = true`, `openingHours = null`, never defaulting to always-open (Pitfall 3 / T-01-12)
- `GET /api/places/details` implements 30-day cache-first: Drizzle `WHERE place_id = $1 AND updated_at > now()-30days` → DB hit returns immediately with no Google call; miss calls `placeDetails()`, derives `defaultVisitDurationMinutes`, upserts via `onConflictDoUpdate(place_id)`, returns result
- All 52 tests pass (27 duration-table + 15 place-details + 10 existing places-client)
- `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically (TDD tasks have RED + GREEN commits):

1. **Task 1 TDD RED** — `c673b15` — `test(01-03): add failing tests for durationForTypes lookup table`
2. **Task 1 TDD GREEN** — `ea01a2f` — `feat(01-03): implement durationForTypes visit-duration lookup table`
3. **Task 2 TDD RED** — `83c03e9` — `test(01-03): add failing tests for placeDetails() with Enterprise field mask and hours_unknown rule`
4. **Task 2 TDD GREEN** — `f0a458f` — `feat(01-03): extend places-client with placeDetails() and DETAILS_FIELD_MASK`
5. **Task 3** — `52929d6` — `feat(01-03): wire GET /api/places/details with 30-day cache-first logic`

## Files Created/Modified

- `src/lib/places/duration-table.ts` — Priority-ordered lookup table; exports `durationForTypes()` and `DURATION_TABLE`; cafe/coffee_shop (30 min) precedes food group (60 min) in priority
- `src/lib/places/duration-table.test.ts` — 27 Vitest tests: all 8 type groups, fallback, empty array, multi-type priority order
- `src/lib/google/place-details.test.ts` — 15 Vitest tests: host validation, field mask contents, hours_unknown rule (both true and false), utcOffsetMinutes pass-through, error handling
- `src/lib/google/places-client.ts` — Added `DETAILS_FIELD_MASK` constant, `PlaceDetailsResult` and `OpeningHoursPeriod` interfaces, `placeDetails()` async function
- `src/app/api/places/details/route.ts` — GET handler: 400 on missing placeId, Drizzle 30-day cache query, placeDetails() on miss, durationForTypes() derivation, onConflictDoUpdate upsert

## Decisions Made

- `DETAILS_FIELD_MASK` is a separately exported constant (not merged into `ESSENTIALS_FIELD_MASK`) — this preserves independent auditability of each field set for cost control purposes
- Priority-ordered lookup table for `durationForTypes()` means the first matching input type wins; cafe/coffee_shop is tested before the food group to ensure 30-minute mapping takes precedence over 60-minute mapping
- `cached: boolean` field added to the response shape (not in the plan spec) so callers can distinguish cache hits from fresh fetches — no extra DB query required
- `parsePriceLevel()` helper maps Google's `PRICE_LEVEL_*` enum strings to integers (0–4) matching the `price_level INTEGER` column in the schema

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added parsePriceLevel() helper for priceLevel type mapping**

- **Found during:** Task 3 implementation
- **Issue:** Google Places API (New) returns `priceLevel` as a string enum (`PRICE_LEVEL_MODERATE`) but the DB schema stores it as `INTEGER`. Without mapping, the upsert would fail at runtime with a type mismatch.
- **Fix:** Added `parsePriceLevel()` function mapping `PRICE_LEVEL_FREE/INEXPENSIVE/MODERATE/EXPENSIVE/VERY_EXPENSIVE` to 0–4; unrecognized values return null.
- **Files modified:** `src/app/api/places/details/route.ts`
- **Impact:** Correct behavior — no data loss or type errors on upsert.

**2. [Rule 2 - Missing Critical] Added `cached: boolean` to response shape**

- **Found during:** Task 3 implementation
- **Issue:** The plan response shape did not include a way to distinguish cache hits from fresh Google fetches. Without this, callers cannot log cache hit rates for cost monitoring.
- **Fix:** Added `cached: true` on DB hit path, `cached: false` on Google fetch path.
- **Files modified:** `src/app/api/places/details/route.ts`
- **Impact:** Enhances observability for the cost-control requirement (T-01-09) with zero breaking changes.

**Total deviations:** 2 auto-fixed (both Rule 2 missing critical correctness)

## Threat Flags

No new security-relevant surface beyond the plan's threat model. All four threats (T-01-09 through T-01-12) are mitigated:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-01-09 DoS/cost (Enterprise SKU) | 30-day cache-first; field mask | Implemented |
| T-01-10 Tampering (placeId param) | 400 before Google call; Drizzle parameterized query | Implemented |
| T-01-11 Info Disclosure (API key) | `GOOGLE_PLACES_API_KEY` in process.env only | Implemented |
| T-01-12 Wrong hours default | `hoursUnknown = true` when `regularOpeningHours` absent | Implemented |

## TDD Gate Compliance

Tasks 1 and 2 followed the RED/GREEN TDD gate:

| Task | RED commit | GREEN commit | Status |
|------|-----------|-------------|--------|
| Task 1 (durationForTypes) | c673b15 (test) | ea01a2f (feat) | Compliant |
| Task 2 (placeDetails) | 83c03e9 (test) | f0a458f (feat) | Compliant |

## Next Phase Readiness

- Plan 01-04 (URL resolution + cost controls) can proceed — `places` cache and both API clients are established
- Phase 2 optimizer depends on:
  - `GET /api/places/details` response: `openingHours`, `utcOffsetMinutes`, `hoursUnknown`, `defaultVisitDurationMinutes`
  - `durationForTypes()` directly importable from `@/lib/places/duration-table`
- Blocker: Real Enterprise SKU calls require `GOOGLE_PLACES_API_KEY` configured; validate opening hours coverage rate for Taiwanese attractions empirically (see RESEARCH.md unknowns)

## Self-Check: PASSED

**Files verified:**
- FOUND: src/lib/places/duration-table.ts
- FOUND: src/lib/places/duration-table.test.ts
- FOUND: src/lib/google/place-details.test.ts
- FOUND: src/lib/google/places-client.ts (placeDetails added)
- FOUND: src/app/api/places/details/route.ts

**Commits verified:**
- FOUND: c673b15 (test: RED durationForTypes)
- FOUND: ea01a2f (feat: GREEN durationForTypes)
- FOUND: 83c03e9 (test: RED placeDetails)
- FOUND: f0a458f (feat: GREEN placeDetails)
- FOUND: 52929d6 (feat: GET /api/places/details route)

---
*Phase: 01-foundation-api-integration*
*Completed: 2026-06-25*
