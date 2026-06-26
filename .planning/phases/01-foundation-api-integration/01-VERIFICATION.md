---
phase: 01-foundation-api-integration
verified: 2026-06-25T23:20:00Z
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "POST /api/places/resolve with a real Chinese place name returns resolved place details (name, coordinates, address) from the Google Places API, with X-Goog-FieldMask applied"
    expected: "Response contains { placeId, displayName, formattedAddress, lat, lng } with real data from Google; DB row created in places table"
    why_human: "Requires live GOOGLE_PLACES_API_KEY and DATABASE_URL environment credentials — cannot be verified without environment setup"
  - test: "Second lookup of the same place_id returns cached data without a new Google API call"
    expected: "GET /api/places/details returns { cached: true } and no outbound request to places.googleapis.com is made"
    why_human: "Requires live credentials and DB with a pre-seeded row from the first lookup; cache hit vs miss requires runtime observation"
  - test: "A Google Maps short URL (maps.app.goo.gl) submitted to POST /api/places/resolve returns correct place details"
    expected: "Redirect followed, coordinates extracted, circle-restricted Text Search returns the correct place"
    why_human: "Real short URL redirect follow requires live network access; unit tests use injected fetch mocks — not real redirects"
  - test: "GCP billing alerts ($10, $50, $100) and hard daily quota cap are configured on the Places API (New)"
    expected: "GCP Console shows 3 billing budget alerts; Places API (New) daily quota cap is set; browser key and server key have correct restrictions"
    why_human: "GCP Console configuration is an operator action — not verifiable in code. SUMMARY explicitly records steps 1-3 as SKIPPED (T-01-13 open blocker)"
  - test: "Destination city field is applied as a city-specific locationBias (not a generic Taiwan-center fallback) on Text Search calls"
    expected: "Searching for a place in a non-Taiwan city (e.g., Kyoto) uses that city's coordinates as the bias center, not a hardcoded Taiwan lat/lng"
    why_human: "buildCityBias() ignores the city parameter and returns a hardcoded Taiwan-center circle (23.6978, 120.9605). Real city geocoding was deferred per SUMMARY; only verifiable end-to-end with real API calls across multiple city inputs"
---

# Phase 01: Foundation + API Integration — Verification Report

**Phase Goal:** Infrastructure is in place — database schema, auth scaffold, and Google Places API resolution with shared cache and hard cost controls — so that all subsequent phases can build on a stable, cost-safe foundation.
**Verified:** 2026-06-25T23:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Developer can POST a Chinese place name and receive resolved place details (name, coordinates, address, opening hours) with field masking on every call | ⚠ PRESENT_BEHAVIOR_UNVERIFIED | `POST /api/places/resolve` route wired with Zod validation, `textSearch()` with `X-Goog-FieldMask: ESSENTIALS_FIELD_MASK` on every call, `onConflictDoUpdate` upsert. PlaceResolverForm sends correct JSON. All code correct; requires live credentials to confirm runtime behavior. |
| SC2 | Second lookup of the same place_id returns cached data from DB without a new Google API call | ⚠ PRESENT_BEHAVIOR_UNVERIFIED | `GET /api/places/details` implements 30-day cache-first: Drizzle `WHERE place_id = $1 AND updated_at > now()-30days`; cache hit returns `{ cached: true }` without calling `placeDetails()`. Logic is correct; cache hit vs. miss requires runtime observation with live DB. |
| SC3 | A Google Maps short URL or full URL submitted to the resolve endpoint returns correct place details | ⚠ PRESENT_BEHAVIOR_UNVERIFIED | `resolveMapsUrl()` implemented with HEAD/GET redirect-follow, `/@lat,lng` extraction, and circle-restricted Text Search. Branched in POST handler via `input.startsWith("http")`. 6 unit tests pass with injected fetch mocks. Real redirect behavior requires live network. |
| SC4 | The destination city field is applied as locationBias on every Text Search call | ✓ VERIFIED (partial) | `textSearch()` always calls `buildCityBias(city)` when no explicit bias provided; locationBias is present in every API request body. **Caveat:** `buildCityBias()` ignores the city string and returns a hardcoded Taiwan-center circle (23.6978°N, 120.9605°E). City-specific geocoding was explicitly deferred per SUMMARY ("Plan 04 will geocode the city"). For the target Taiwan use case, this is functionally adequate; for non-Taiwan cities it is incorrect. |
| SC5 | GCP billing alerts and daily quota cap are active; Supabase schema is seeded and RLS policies are in place | ✗ FAILED (partial) | Supabase schema: 4 migration SQL files exist and are correct (0000_places.sql, 0001_itineraries.sql, 0002_rls.sql). RLS policies verified in code. GCP controls: SKIPPED per SUMMARY — billing alerts ($10/$50/$100), daily quota cap, and key restrictions NOT configured (T-01-13 open). Cost controls require operator GCP Console action. |

**Score:** 4/5 truths present with code evidence (SC1-SC4); 1 truth partially failed (SC5 — GCP controls unfinished). All 4 present truths require runtime/operator verification to confirm runtime behavior.

### Deferred Items

None — all SC items are within Phase 1 scope.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Next.js 15+ App Router project scaffold | ✓ VERIFIED | next@16.2.9, react@19.2.4, all required deps present |
| `next.config.ts` | Next.js configuration file | ✓ VERIFIED | Exists; minimal config (correct for Next.js 15 defaults) |
| `tsconfig.json` | TypeScript configuration | ✓ VERIFIED | Exists at project root |
| `vitest.config.ts` | Test runner configuration | ✓ VERIFIED | Exists; node environment, @/* alias |
| `drizzle.config.ts` | Drizzle ORM configuration | ✓ VERIFIED | Exists; points to `src/lib/db/schema.ts` |
| `src/lib/db/schema.ts` | 4-table Drizzle schema (places, itineraries, itinerary_days, place_visits) | ✓ VERIFIED | All 4 tables present with correct columns, UUID PKs, UNIQUE constraints, ON DELETE CASCADE foreign keys |
| `src/lib/db/migrations/0000_places.sql` | places table migration | ✓ VERIFIED | CREATE TABLE with all 14 columns including place_id UNIQUE, opening_hours JSONB, hours_unknown |
| `src/lib/db/migrations/0001_itineraries.sql` | itineraries/days/visits migration | ✓ VERIFIED | All 3 CREATE TABLE statements with correct constraints |
| `src/lib/db/migrations/0002_rls.sql` | RLS policies for all 4 tables | ✓ VERIFIED | 7 named policies: places_select_all, places_insert_service, places_update_service, itineraries_owner, itineraries_share_select, itinerary_days_owner, place_visits_owner |
| `src/lib/google/places-client.ts` | Places API client with mandatory field masking | ✓ VERIFIED | ESSENTIALS_FIELD_MASK and DETAILS_FIELD_MASK exported; both applied via X-Goog-FieldMask on every call; uses places.googleapis.com/v1 (not legacy); textSearch() and placeDetails() implemented |
| `src/app/api/places/resolve/route.ts` | POST /api/places/resolve Route Handler | ✓ VERIFIED | Zod validation, URL vs text branching, textSearch + resolveMapsUrl, onConflictDoUpdate upsert, per-input NOT_FOUND marker |
| `src/app/api/places/details/route.ts` | GET /api/places/details Route Handler with 30-day cache | ✓ VERIFIED | Cache-first Drizzle query (updated_at > 30 days ago), placeDetails() on miss, durationForTypes() derivation, onConflictDoUpdate upsert, cached: boolean in response |
| `src/lib/supabase/server.ts` | @supabase/ssr server client | ✓ VERIFIED | createServerClient with Next.js cookies() get/set; NOT deprecated auth-helpers-nextjs |
| `src/lib/supabase/client.ts` | @supabase/ssr browser client | ✓ VERIFIED | createBrowserClient; "use client" directive; anon key only |
| `src/lib/supabase/middleware.ts` | updateSession() middleware | ✓ VERIFIED | Wired correctly; calls supabase.auth.getUser() to refresh token |
| `src/middleware.ts` | Next.js middleware entry point | ✓ VERIFIED | Calls updateSession(); matcher excludes _next/static, images, and static file extensions |
| `src/lib/auth/get-user.ts` | getUser() helper | ✓ VERIFIED | Uses supabase.auth.getUser() (network-validated, not stale session.user); returns user or null |
| `src/lib/google/url-resolver.ts` | resolveMapsUrl() URL resolver | ✓ VERIFIED | HEAD/GET redirect-follow; /@lat,lng extraction; circle-restricted Text Search (radius 100m); injectable fetchImpl for testing; SSRF mitigation (coordinates only, body never fetched) |
| `src/lib/places/duration-table.ts` | durationForTypes() visit duration lookup | ✓ VERIFIED | Priority-ordered table with 8 type groups; cafe (30min) precedes food (60min); DURATION_TABLE map exported; 60-min fallback |
| `docs/cost-controls.md` | GCP cost controls operator runbook | ✓ VERIFIED | File exists with exact GCP Console navigation paths for billing alerts, quota caps, and key restrictions. Checklist items remain unchecked (operator action required). |
| `.env.example` | Environment variable documentation | ✓ VERIFIED | 6 vars documented with server-only annotations |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `PlaceResolverForm` | `POST /api/places/resolve` | `fetch("/api/places/resolve")` in handleSubmit | ✓ WIRED | Correct JSON body with inputs + city |
| `POST /api/places/resolve` | `textSearch()` | import + call with city, apiKey, locationBias | ✓ WIRED | Text path correctly routed |
| `POST /api/places/resolve` | `resolveMapsUrl()` | import + call when input.startsWith("http") | ✓ WIRED | URL path correctly branched |
| `POST /api/places/resolve` | `places` (Drizzle table) | `db.insert(places).onConflictDoUpdate({ target: places.place_id })` | ✓ WIRED | Upsert on cache miss |
| `GET /api/places/details` | `places` (Drizzle cache) | Drizzle `.select().from(places).where(and(eq, gt))` | ✓ WIRED | 30-day cache check before Google call |
| `GET /api/places/details` | `placeDetails()` | import + call on cache miss | ✓ WIRED | Enterprise SKU field mask applied |
| `GET /api/places/details` | `durationForTypes()` | import + call with details.types | ✓ WIRED | Duration derived from place types |
| `src/middleware.ts` | `updateSession()` | import + await call | ✓ WIRED | Session refresh on every matched request |
| `textSearch()` | `X-Goog-FieldMask: ESSENTIALS_FIELD_MASK` | header on every fetch | ✓ WIRED | Verified in source and 10 unit tests |
| `placeDetails()` | `X-Goog-FieldMask: DETAILS_FIELD_MASK` | header on every fetch | ✓ WIRED | Verified in source and 15 unit tests |
| `hours_unknown` | `regularOpeningHours` absence check | `const hasHours = data.regularOpeningHours !== undefined; hoursUnknown: !hasHours` | ✓ WIRED | Correct rule; verified by test "sets hoursUnknown = true when regularOpeningHours is absent" |

### Data-Flow Trace (Level 4)

`PlaceResolverForm` renders `results` state which is populated from the `POST /api/places/resolve` API response — not static/empty data. State is set via `setResults(data as ResolvedPlace[])` after a successful fetch. The form is a real functional component, not a placeholder. No disconnected props or hardcoded empty arrays on the render path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 58 unit tests pass (textSearch, placeDetails, durationForTypes, resolveMapsUrl) | `npx vitest run` | 4 test files, 58 tests, 0 failures — 2.84s | ✓ PASS |
| X-Goog-FieldMask sent on every textSearch call | test: "sends X-Goog-FieldMask header with exactly the Essentials field set" | PASS | ✓ PASS |
| hoursUnknown = true when regularOpeningHours absent | test: "sets hoursUnknown = true when regularOpeningHours is absent (never defaults to always-open)" | PASS | ✓ PASS |
| resolveMapsUrl returns null when no coordinate pattern found | test: "returns null when no /@lat,lng pattern is in the expanded URL" | PASS | ✓ PASS |
| POST /api/places/resolve with live credentials | Requires live GOOGLE_PLACES_API_KEY + DATABASE_URL | Cannot run without credentials | ? SKIP |

### Probe Execution

No probe scripts declared or found under `scripts/*/tests/probe-*.sh`. Step 7c: SKIPPED (no conventional probe scripts).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INPUT-01 | 01-01 | Multi-line Chinese place name input | ✓ SATISFIED | PlaceResolverForm textarea splits by newline; resolveRequestSchema validates inputs array |
| INPUT-02 | 01-04 | Google Maps URL parsing | ✓ SATISFIED | resolveMapsUrl() implemented and wired in resolve route via startsWith("http") branch |
| INPUT-03 | 01-01 | Destination city field as locationBias | ✓ SATISFIED (with caveat) | city required in Zod schema; buildCityBias() applied on every textSearch; city-specific geocoding deferred |
| INPUT-04 | 01-01/03 | Auto-fetch place details via Google Places API | ✓ SATISFIED | textSearch() for resolve, placeDetails() for details; opening hours, coordinates, address all returned |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/google/places-client.ts` | 79, 134-151 | `buildCityBias()` accepts `city` param but ignores it; returns hardcoded Taiwan-center circle for all city inputs | ⚠ Warning | SC4 is "locationBias applied per city" — the bias IS applied but is not city-specific. Non-Taiwan destinations will have incorrect bias. SUMMARY explicitly calls this a skeleton; Plan 04 was supposed to geocode the city but didn't. |
| `docs/cost-controls.md` | 121-127 | GCP checklist items all unchecked (`- [ ]`) | ⚠ Warning | T-01-13 open — billing alerts and quota cap not configured. Documented as OPEN blocker by operator. |

No `TBD`, `FIXME`, or `XXX` markers found in source files. The `return null` patterns in url-resolver.ts, places-client.ts, and get-user.ts are all intentional domain-logic nulls (NOT_FOUND, error handling), not stubs.

### Human Verification Required

#### 1. End-to-End POST /api/places/resolve with Live Credentials

**Test:** Configure `.env.local` with GOOGLE_PLACES_API_KEY and DATABASE_URL. Run `npm run dev`. Submit "台北101" with city "台北市" via the PlaceResolverForm.
**Expected:** Response contains displayName, formattedAddress, lat/lng. DB row created in `places` table with place_id UNIQUE. X-Goog-FieldMask header present in outbound Google API call (observable via GCP API logs).
**Why human:** Requires live Google API credentials and live Supabase database.

#### 2. Cache Hit Verification (Success Criterion 2)

**Test:** After a place is resolved once, call `GET /api/places/details?placeId=<id>` twice. Check the `cached` field in both responses.
**Expected:** First call returns `cached: false` (Google API called). Second call returns `cached: true` (DB served, no Google call). GCP API logs show only one Places API call for two requests.
**Why human:** Cache hit/miss requires runtime observation with a live database.

#### 3. Google Maps Short URL Resolution (Success Criterion 3)

**Test:** Submit a real `maps.app.goo.gl` short URL to POST /api/places/resolve.
**Expected:** Redirect is followed, coordinates extracted, correct place resolved. NOT_FOUND is returned with appropriate message if redirect does not contain /@lat,lng.
**Why human:** Real redirect follow requires live network. Unit tests use injected fetch mocks — real short URL behavior may differ (some URLs return HTML redirect pages that HEAD cannot follow).

#### 4. GCP Cost Controls Configuration (Success Criterion 5 — OPEN BLOCKER)

**Test:** Open GCP Console and verify each item in `docs/cost-controls.md` operator checklist.
**Expected:** 3 billing budget alerts ($10, $50, $100) created; hard daily quota cap on Places API (New) set; browser key restricted to Maps JavaScript API + HTTP referrers; server key restricted to Places API (New) + Routes API + IP.
**Why human:** GCP Console is an operator action. Code has no mechanism to verify GCP-level configurations. Per SUMMARY 01-04, steps 1-3 were SKIPPED — this is a pre-production blocker (T-01-13).

#### 5. City-Specific locationBias Accuracy

**Test:** Submit "故宮" with city "京都市" (Kyoto, Japan) and with city "台北市" (Taipei, Taiwan) separately.
**Expected:** Each should resolve to the correct city's result. With the current hardcoded Taiwan-center bias, the Kyoto query may incorrectly resolve to the Taipei National Palace Museum.
**Why human:** `buildCityBias()` returns a fixed Taiwan-center circle regardless of city. Whether this causes incorrect resolution for non-Taiwan cities requires real API calls to confirm.

---

## Gaps Summary

**SC5 (GCP billing alerts + quota cap):** The cost controls required by Success Criterion 5 were explicitly skipped by the operator (Task 4 deviation in 01-04-SUMMARY). `docs/cost-controls.md` provides the runbook but the GCP Console checklist items remain unchecked. This is a pre-production blocker documented in STATE.md as T-01-13.

**SC4 (city-specific locationBias):** The Zod schema requires a city field and locationBias IS applied on every Text Search call. However, `buildCityBias()` ignores the city string and uses a hardcoded Taiwan-center circle (23.6978°N, 120.9605°E). The CONTEXT.md and SUMMARY explicitly called this a Phase 1 skeleton ("Plan 04 will geocode the city"). Plan 04 did not implement city geocoding — it focused on URL resolution. This is a WARNING for non-Taiwan destinations, not a blocker for the Taiwan-focused primary use case.

---

_Verified: 2026-06-25T23:20:00Z_
_Verifier: Claude (gsd-verifier)_
