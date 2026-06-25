# Phase 1: Foundation + API Integration — Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Synthesized from project research (STACK.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md)

<domain>
## Phase Boundary

Phase 1 delivers the infrastructure that every subsequent phase depends on:
- Next.js 15 App Router project scaffold (TypeScript, Tailwind v4, shadcn/ui)
- Supabase PostgreSQL schema: `places`, `itineraries`, `itinerary_days`, `place_visits` tables with RLS policies
- Supabase Auth scaffold (email/password + Google OAuth wiring — UI deferred to Phase 4)
- Google Places API (New) integration: `POST /api/places/resolve` and `GET /api/places/details` Route Handlers
- Shared places cache (30-day TTL) with mandatory field masking on every API call
- GCP billing alerts and hard daily quota cap
- Environment variable structure (two separate API keys: browser-restricted + server-restricted)

Phase 1 does NOT include: the optimizer, the UI components, auth login pages, or itinerary persistence.

</domain>

<decisions>
## Implementation Decisions

### Framework & Scaffold
- Next.js 15 App Router (NOT Pages Router) — server components keep API keys out of browser
- TypeScript 5.x throughout
- Tailwind CSS v4 (zero-config, no `tailwind.config.ts`)
- shadcn/ui for components (copy-paste model, Radix primitives)
- Drizzle ORM ^0.33.x with `postgres` driver (NOT Prisma — 7x faster cold start, 24x smaller bundle)
- `drizzle-kit` for migration generation

### Database (Supabase / PostgreSQL)
- Four tables: `places`, `itineraries`, `itinerary_days`, `place_visits`
- `places` is a cross-user shared cache keyed on Google `place_id` (TEXT UNIQUE)
- `opening_hours` stored as JSONB (regularOpeningHours.periods array) — NEVER freetext
- `default_visit_duration_minutes` derived from Google place types (heuristic table)
- All IDs: UUID PRIMARY KEY DEFAULT gen_random_uuid() — no sequential integers
- `itineraries.share_token`: UUID UNIQUE DEFAULT gen_random_uuid() for public sharing
- `itineraries.is_public`: BOOLEAN DEFAULT false (must be checked server-side on every share access)
- Store original query string alongside place_id for NOT_FOUND re-resolution fallback (Phase 7 pitfall prevention)
- RLS: itineraries SELECT for owner OR share_token match; places SELECT for all, INSERT/UPDATE for service_role only

### Google API Integration
- Google Places API (New) ONLY — `places.googleapis.com/v1/places` base URL, NOT legacy `/maps/api/place/`
- Mandatory `X-Goog-FieldMask` header on EVERY call — never omit
- Two separate API keys: browser key (HTTP referrer restricted, Maps JS API only) + server key (IP restricted, Places + Routes APIs)
- Server key in environment variables ONLY — never in client bundle
- All Places and Routes API calls proxied through Next.js Route Handlers
- Text Search fields for resolution (Essentials SKU): `id,displayName,formattedAddress,location`
- Place Details fields (Enterprise SKU, required for opening hours): `id,displayName,formattedAddress,location,regularOpeningHours,priceLevel,rating,types`

### Caching Strategy
- Cache-first for all Place Details: check DB before any Google API call
- 30-day TTL (WHERE updated_at > NOW() - INTERVAL '30 days')
- Cache miss: fetch from Google, upsert into places table
- Never re-fetch within TTL for the same place_id

### Input Resolution
- `POST /api/places/resolve`: accepts array of raw inputs (Chinese text or Google Maps URLs)
- For URLs: HTTP HEAD to follow redirect → extract `/@lat,lng` or `?cid=` from expanded URL → Text Search with locationRestriction circle(lat,lng, 100m)
- For text: Text Search (New) with `textQuery` + `languageCode: "zh-TW"` + `locationBias` (city bounding box)
- Always require user to specify destination city BEFORE lookup — apply city bounding box as locationBias
- Return top 1 result per input with displayName + formattedAddress for user confirmation
- `GET /api/places/details`: cache-first fetch of opening hours, coords, duration

### Cost Controls (Non-negotiable — must ship in Phase 1)
- GCP billing alerts at $10, $50, $100
- Hard daily quota cap configured in GCP Console before any user-facing feature ships
- Field masking on every API call from line 1 of code

### Unknown Opening Hours Handling
- When `regularOpeningHours` is absent: set `hoursUnknown: true`, display warning in UI
- NEVER treat missing hours as "always open"
- Store `utcOffsetMinutes` alongside opening hours for timezone-correct scheduling

### Environment Variables
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — browser-restricted, Maps JS only
- `GOOGLE_PLACES_API_KEY` — server-only, Places + Routes APIs
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to browser

### Claude's Discretion
- Exact project scaffold commands (create-next-app flags)
- Drizzle schema file organization (single schema.ts vs split)
- Error response shape for Route Handlers
- Short URL redirect follow implementation (fetch HEAD vs dedicated library)
- Zod schema definitions for API request/response validation
- TanStack Query setup details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Research (authoritative for this project)
- `.planning/research/STACK.md` — Technology stack decisions with rationale
- `.planning/research/ARCHITECTURE.md` — Data model SQL, component boundaries, API call patterns, data flows
- `.planning/research/PITFALLS.md` — Pitfalls 1–3, 6, 12 are directly relevant to Phase 1
- `.planning/research/SUMMARY.md` — Executive summary with cost mitigation strategies

### External References
- Google Places API (New): `places.googleapis.com/v1/places` — field mask, SKU tiers
- Supabase RLS documentation — Row Level Security policy patterns
- Drizzle ORM docs — schema definition, drizzle-kit migrations
- Next.js App Router docs — Route Handlers, Server Components, env var patterns
- `@supabase/ssr` — replaces deprecated `@supabase/auth-helpers-nextjs`

</canonical_refs>

<specifics>
## Specific Constraints

- Opening hours MUST be stored as JSONB `regularOpeningHours.periods` array — optimizer cannot use freetext
- `utcOffsetMinutes` MUST be stored alongside opening hours for Phase 2 timezone-correct scheduling
- Cross-city trip support: data model must support geographic clustering in v2 without schema migration — include `city`/`region` column on itineraries from Phase 1
- Default visit duration lookup table by place type (museum 120min, restaurant 60min, landmark 45min, park 90min, mall 90min, cafe 30min, fallback 60min) — needed by Phase 2 optimizer

</specifics>

<deferred>
## Deferred to Later Phases

- Auth login/registration UI — Phase 4
- Optimizer / scheduling logic — Phase 2
- PlaceInput UI, ItineraryView, MapView — Phase 3
- Save/load itinerary persistence — Phase 4
- Public share link endpoint — Phase 4
- Rate limiting (50 searches/user/day) — Phase 5
- 300ms debounce on frontend — Phase 5
- Drag-and-drop reorder — Phase 5

</deferred>

---

*Phase: 01-foundation-api-integration*
*Context gathered: 2026-06-25 via project research synthesis*
