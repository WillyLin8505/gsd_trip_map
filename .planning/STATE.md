---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: polish-edit-cost
status: implemented
stopped_at: Phase 05 Waves 1–3 implemented (duration override, rate limit, debounce); Wave 4 (375px walkthrough) needs browser; tsc clean
last_updated: "2026-06-26T17:45:00.000Z"
last_activity: 2026-06-26
last_activity_desc: Implemented Phase 05 — INPUT-05 duration override, per-subject daily rate limit (api_usage), 300ms input debounce; tsc clean, 4 new test files
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 15
  completed_plans: 15
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25)

**Core value:** 貼上景點清單就能得到一份可直接執行的最佳化行程（省去手動查資料 + 手動排順序的麻煩）
**Current focus:** Phase 03 — core-ui

## Current Position

Phase: 04 (auth-save) — IMPLEMENTED & pushed; pending CI tests + operator OAuth config
Phase: 05 (polish-edit-cost) — IMPLEMENTED (Waves 1–3); Wave 4 (375px walkthrough) needs browser
Status: All 5 phases code-complete & typechecked; verification (CI tests/build + 375px) deferred
Last activity: 2026-06-26 — Phase 05 implemented (duration override, rate limit, debounce)

Progress: [█████████▉] ~98% (5/5 phases code-complete; CI verify + mobile UAT + migration pending)

## Verification Status

**Phase 01 verification:** `.planning/phases/01-foundation-api-integration/01-VERIFICATION.md`

- Score: 4/5 must-haves verified in code
- Status: human_needed
- Blocking items before production:
  1. End-to-end POST /api/places/resolve with live credentials (SC1)
  2. Cache hit verification — GET /api/places/details returns cached: true on second call (SC2)
  3. Google Maps short URL resolution with real maps.app.goo.gl URL (SC3)
  4. **GCP cost controls** — billing alerts ($10/$50/$100), daily quota cap, API key restrictions (SC5 / T-01-13 OPEN BLOCKER)
  5. City-specific locationBias accuracy for non-Taiwan destinations (SC4 caveat)

**Phase 02 verification:** `.planning/phases/02-optimization-engine/02-VERIFICATION.md`

- Score: 5/5 must-haves verified
- Status: **passed**
- All SCHED-01 through SCHED-05 requirements verified
- 161/161 tests pass across 11 test files
- hoursUnknown rule correctly implemented (slot retained, warning emitted)
- computeRouteMatrix called exactly once per optimize request
- Optimizer modules are pure (zero I/O: no fetch, DB, or process.env)

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: ~6 min/plan
- Total execution time: ~0.67 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 4 | ~34 min | ~8.5 min |
| Phase 02 | 3 | ~20 min | ~6.7 min |

**Recent Trend:** Fast execution with TDD compliance across all plans.

| Phase 01 P01 | 19 | 4 tasks | 16 files |
| Phase 01 P02 | 4 | - tasks | - files |
| Phase 01-foundation-api-integration P03 | 6 | 3 tasks | 5 files |
| Phase 01 P04 | 5 | 3 tasks | 4 files |
| Phase 02 P01 | 5 | 2 tasks | 5 files |
| Phase 02 P02 | 7 | 2 tasks | 5 files |
| Phase 02 P03 | 8 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Next.js 15 App Router on Vercel + Supabase (PostgreSQL + Auth) + Drizzle ORM
- [Init]: All Google API calls proxied server-side via Next.js Route Handlers — no API keys in browser
- [Init]: Shared places table as cross-user cache (30-day TTL) with mandatory field masking on every Places API call
- [Init]: Pure TypeScript nearest-neighbor + 2-opt optimizer; no external algorithm dependencies
- [Phase ?]: Next.js 15 App Router selected for server components keeping API keys out of browser
- [Phase ?]: Drizzle ORM over Prisma for 7x faster cold start in serverless
- [Phase ?]: Google Places API (New) only at places.googleapis.com/v1 — never legacy /maps/api/place/
- [Phase ?]: city required in resolve request to enforce locationBias and prevent cross-city name ambiguity
- [Phase ?]: itineraries.city + region added in Phase 1 for locationBias today and cross-city clustering in v2 without migration
- [Phase ?]: getUser() calls supabase.auth.getUser() (network-validated) not session.user (stale/spoofable)
- [Phase ?]: RLS policy names match RESEARCH.md exactly for stable downstream reference
- [Verification]: buildCityBias() uses hardcoded Taiwan-center for all cities — city-specific geocoding deferred; non-Taiwan destinations may resolve incorrectly
- [Phase ?]: Re-export OpeningHoursPeriod from places-client.ts
- [Phase ?]: Minutes-of-week (0-10079) as midnight-crossing comparison domain — eliminates boundary edge cases
- [Phase ?]: isOpenAt returns false for empty periods — hoursUnknown policy lives in scheduler 02-02
- [Phase ?]: routeTravelTime is open path (no return-to-origin) — itineraries end at last stop
- [Phase ?]: getOpenWindow() extracts concrete openTime/closeTime for arithmetic; separate from isOpenAt() boolean
- [Phase ?]: splitIntoDays null-sentinel for overflow mode
- [Phase ?]: Optimizer never treats infeasible pairs as zero-cost travel
- [Phase ?]: 422 Semantically more correct than 400; callers know exactly what to resolve first
- [Phase ?]: Same GCP server key for both Places and Routes APIs — one env var, same billing account (02-CONTEXT.md)
- [Phase ?]: Text-resolved places without detail fetch always get a valid duration in OptimizerPlace
- [Phase ?]: shadcn Nova preset with Tailwind v4: Lucide icons + Geist fonts
- [Phase ?]: globals.css Geist font tokens restored after shadcn init circular var reference bug
- [Phase ?]: buildCityBias() fixed: 24-entry Taiwan city lookup + 100km fallback for non-Taiwan cities
- [Phase ?]: Wave-0 RED scaffold pattern: test files import unimplemented components to document DISP-01/02/03 contracts
- [03-02]: Node vitest env: pure data assertions in component tests (no DOM/jsdom) — compatible with existing test infrastructure
- [03-02]: resolvedPlaces: ResolvedPlace[] retains lat/lng through all state transitions for 03-04 coordinate join
- [03-02]: ResultsLayout accepts resolvedPlaces prop now (forwarded unused) to lock interface for 03-04 without signature change
- [03-03]: hoursUnknown amber badge exact copy '營業時間未知，建議出發前確認' — SC4 requires identical copy in both itinerary row and map InfoWindow (03-04)
- [03-03]: usePlaceDetails dedup via Set-based useRef + placeIds.join(',') dependency string
- [03-03]: Global hoursUnknown alert uses optimizer flag (not details), works before details are fetched
- [03-04]: useCallback on ALL AdvancedMarker click handlers — mandatory for #404 infinite re-render prevention
- [03-04]: hoursUnknown in InfoWindow sourced from visit directly (not detailsById) — warning appears immediately before usePlaceDetails resolves
- [03-04]: map-view-wrapper.tsx is the only import path for MapView — ssr:false gate prevents window-not-defined SSR crash
- [03-04]: Coordinate gap join in ResultsLayout (buildDaysWithCoords) — coordMap from resolvedPlaces keyed by placeId

### Pending Todos

- Complete GCP cost controls checklist (docs/cost-controls.md steps 1-3) — REQUIRED before production traffic
- Complete Phase 01 human verification checklist (5 runtime/operator items — see Verification Status above)

### Blockers/Concerns

- [Phase 1 RESOLVED]: Google Maps short URL parsing implemented and tested via redirect-follow + coordinate extraction (01-04)
- [Phase 1 OPEN — pre-production blocker]: T-01-13: GCP billing alerts ($10/$50/$100), hard daily Places API quota cap, and API key restrictions not configured — operator skipped these in Task 4. Must complete docs/cost-controls.md steps 1-3 before sending user traffic.
- [Phase 1 WARNING]: buildCityBias() ignores city parameter; returns hardcoded Taiwan-center (23.6978, 120.9605). Adequate for Taiwan-focused Phase 1; Phase 2 or 3 should geocode city for correct non-Taiwan bias.
- [Phase 1]: Opening hours coverage rate for Taiwanese attractions is unknown — validate empirically early in Phase 3
- [Phase 2 RESOLVED]: All optimizer functions implemented and tested; 161/161 tests pass
- [Phase 2]: Cross-city geographic clustering deferred to v2 — ensure data model supports it to avoid schema migrations

## Session Continuity

Last session: 2026-06-26T16:30:00.000Z
Stopped at: Phase 03 closed — UAT 2/2 pass (browser-verified). 2 non-blocking gaps carried (see 03-UAT.md Gaps).
Resume action: Plan Phase 04 (auth-save) — create .planning/phases/04-auth-save/ + plans
Resume file: .planning/phases/04-auth-save/04-01-PLAN.md (to be created)

### Carried non-blocking concerns (from Phase 03 UAT)
- Time-slot values reported possibly "off by hours" in browser; no TZ conversion found in code; could not reproduce server-side. Treat feature as working pending explicit report.
- place-row.tsx summarizeHours() shows openingHours[0] (Sunday) regardless of travel day — candidate fix in Phase 5.
