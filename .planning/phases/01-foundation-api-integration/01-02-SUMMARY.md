---
phase: 01-foundation-api-integration
plan: "02"
subsystem: db-auth
tags: [drizzle, supabase, rls, postgresql, next.js, typescript, auth]

requires:
  - 01-01 (places table, db client, schema.ts baseline)

provides:
  - itineraries, itinerary_days, place_visits Drizzle table definitions
  - src/lib/db/migrations/0001_itineraries.sql (three CREATE TABLE statements)
  - src/lib/db/migrations/0002_rls.sql (RLS on all four tables)
  - Supabase createClient() — server (@supabase/ssr) and browser (createBrowserClient)
  - updateSession() middleware for session-cookie refresh on every request
  - getUser() helper for Route Handler auth checks

affects:
  - 01-03-PLAN (cache-first details endpoint inherits RLS on places)
  - 01-04-PLAN (URL resolution uses Route Handlers; getUser() guards them)
  - All subsequent phases (auth scaffold and full schema are the foundation)

tech-stack:
  added: []
  patterns:
    - "Drizzle unique() constraint helper for multi-column unique indexes"
    - "@supabase/ssr createServerClient pattern with Next.js cookies() get/set"
    - "@supabase/ssr createBrowserClient for Client Components"
    - "updateSession() middleware pattern — called in src/middleware.ts matcher"
    - "getUser() returns user or null — Route Handlers check if (!user) return 401"

key-files:
  created:
    - src/lib/db/migrations/0001_itineraries.sql
    - src/lib/db/migrations/0002_rls.sql
    - src/lib/supabase/server.ts
    - src/lib/supabase/client.ts
    - src/lib/supabase/middleware.ts
    - src/middleware.ts
    - src/lib/auth/get-user.ts
  modified:
    - src/lib/db/schema.ts

key-decisions:
  - "itineraries.city + region added now (not later) for locationBias today and cross-city clustering in v2 without migration"
  - "share_token uses UUID DEFAULT gen_random_uuid() — pre-populated at row creation, not lazily"
  - "getUser() calls supabase.auth.getUser() (network-validated) not session.user (stale/spoofable)"
  - "middleware.ts matcher excludes static assets and _next/* to avoid unnecessary session refresh overhead"
  - "RLS policy names match RESEARCH.md exactly for stable downstream reference"

metrics:
  duration: 4min
  completed: "2026-06-25"
  tasks: 3
  files_modified: 8

status: complete
---

# Phase 01 Plan 02: Database Schema + RLS + Supabase Auth Scaffold Summary

**Full four-table PostgreSQL schema with owner-scoped RLS at the database layer, Supabase @supabase/ssr server/browser clients, session-refresh middleware, and a getUser() helper — auth contract for all subsequent phases**

## Performance

- **Duration:** 4 minutes
- **Started:** 2026-06-25T14:45:39Z
- **Completed:** 2026-06-25T14:49:50Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Full data model in place: places + itineraries + itinerary_days + place_visits with UUID primary keys, ON DELETE CASCADE foreign keys, and multi-column unique constraints (UNIQUE(itinerary_id, day_number), UNIQUE(itinerary_day_id, order_index))
- itineraries includes city, region, share_token (UUID UNIQUE pre-populated), and is_public (default false) — supports future cross-city clustering and public sharing with no further migration required
- place_visits stores original_query alongside place_id for NOT_FOUND re-resolution (prevents Phase 7 pitfall)
- RLS enabled on all four tables: places is a shared read cache (SELECT open to all, INSERT/UPDATE restricted to service_role); itineraries has both owner CRUD and public-share SELECT; itinerary_days and place_visits inherit ownership through join chains
- Supabase @supabase/ssr clients wired: server.ts uses createServerClient with Next.js cookies(), client.ts uses createBrowserClient
- Session refresh middleware wires updateSession() into every non-static request — keeps auth tokens alive across server components and route handlers
- getUser() validates session server-side via supabase.auth.getUser() (network call, not stale session.user)
- TypeScript compilation clean (npx tsc --noEmit)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend schema with itineraries, itinerary_days, place_visits + migration** - `0061317` (feat)
2. **Task 2: Author RLS migration for all four tables** - `b6b30da` (feat)
3. **Task 3: Wire Supabase clients, session-refresh middleware, and getUser() helper** - `a23e6ec` (feat)

## Files Created/Modified

- `src/lib/db/schema.ts` — Extended with itineraries, itineraryDays, placeVisits Drizzle table definitions (places table unchanged); exports Place, NewPlace, Itinerary, NewItinerary, ItineraryDay, NewItineraryDay, PlaceVisit, NewPlaceVisit types
- `src/lib/db/migrations/0001_itineraries.sql` — CREATE TABLE for itineraries (user_id FK → auth.users), itinerary_days (UNIQUE(itinerary_id, day_number)), place_visits (UNIQUE(itinerary_day_id, order_index)); includes performance indexes
- `src/lib/db/migrations/0002_rls.sql` — ENABLE ROW LEVEL SECURITY on all four tables; 7 named policies (places_select_all, places_insert_service, places_update_service, itineraries_owner, itineraries_share_select, itinerary_days_owner, place_visits_owner)
- `src/lib/supabase/server.ts` — createClient() via @supabase/ssr createServerClient with Next.js cookies() get/set
- `src/lib/supabase/client.ts` — createClient() via createBrowserClient for Client Components (anon key only)
- `src/lib/supabase/middleware.ts` — updateSession() refreshing session cookies per @supabase/ssr middleware pattern
- `src/middleware.ts` — Calls updateSession(); matcher excludes _next/static, _next/image, and static file extensions
- `src/lib/auth/get-user.ts` — getUser() returning authenticated user or null; uses createServerClient via server.ts, anon key only

## Decisions Made

- `itineraries.share_token` uses `UUID UNIQUE DEFAULT gen_random_uuid()` — pre-populated at row creation so every itinerary is share-ready without a secondary UPDATE
- `getUser()` calls `supabase.auth.getUser()` (validates token against Supabase auth server) not `session.user` which can be stale or spoofed
- Middleware matcher pattern excludes common static file extensions via regex to minimize unnecessary session refresh overhead on asset requests
- RLS policy names match RESEARCH.md exactly (`places_select_all`, `itineraries_owner`, etc.) so downstream agents can reference them by name

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

All threat model items from the plan were addressed:

| Threat ID | Mitigation |
|-----------|-----------|
| T-01-05 | itinerary_days and place_visits owner policies use auth.uid() via subquery join — cross-user row access is impossible without matching auth.uid() |
| T-01-06 | itineraries_share_select requires both is_public = true AND share_token IS NOT NULL — enforced at DB layer |
| T-01-07 | places_insert_service / places_update_service restrict writes to auth.role() = 'service_role' |
| T-01-08 | updateSession() in middleware.ts refreshes session on every request; getUser() validates server-side |

No new security-relevant surface was introduced beyond what the plan's threat model covers.

## User Setup Required

To apply the migrations, run the SQL files in order in the Supabase SQL Editor:
1. `src/lib/db/migrations/0001_itineraries.sql` — creates the three new tables
2. `src/lib/db/migrations/0002_rls.sql` — enables RLS and creates all policies

Note: `src/lib/db/migrations/0000_places.sql` (from Plan 01) must be applied first.

## Next Phase Readiness

- Plan 01-03 (cache-first details endpoint) can proceed — places table has RLS; server.ts client is available
- Plan 01-04 (URL resolution + cost controls) can proceed — POST /api/places/resolve pipeline established, getUser() ready for auth checks
- Phase 2 (optimizer) can proceed — full schema supports itinerary → days → visits hierarchy with all required columns

## Self-Check: PASSED

**Files verified:**
- FOUND: src/lib/db/schema.ts (itineraries, itineraryDays, placeVisits exported)
- FOUND: src/lib/db/migrations/0001_itineraries.sql
- FOUND: src/lib/db/migrations/0002_rls.sql (4x ENABLE ROW LEVEL SECURITY)
- FOUND: src/lib/supabase/server.ts
- FOUND: src/lib/supabase/client.ts
- FOUND: src/lib/supabase/middleware.ts
- FOUND: src/middleware.ts
- FOUND: src/lib/auth/get-user.ts

**Commits verified:**
- FOUND: 0061317 (feat: schema + migration)
- FOUND: b6b30da (feat: RLS migration)
- FOUND: a23e6ec (feat: Supabase clients + middleware + getUser)
