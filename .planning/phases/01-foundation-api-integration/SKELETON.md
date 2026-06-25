# Walking Skeleton — Travel Itinerary Planner（旅遊行程規劃器）

**Phase:** 1 (01-01 Walking Skeleton)
**Generated:** 2026-06-25

## Capability Proven End-to-End

A user can submit a Chinese place name plus a destination city in the browser and see the resolved place (name, address, coordinates) returned by the deployed Next.js app after a real Google Places API (New) Text Search call and a real database upsert into the shared places cache.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router (Next.js 16.x + React 19.x) | App Router server components keep API keys out of the browser bundle; Route Handlers replace separate REST API server; zero-config TypeScript; single deployment unit |
| Data layer | Supabase PostgreSQL + Drizzle ORM | PostgreSQL is the right engine for relational place/itinerary data + JSONB opening hours; Drizzle is 7x faster cold start and 24x smaller bundle vs Prisma — critical for serverless Route Handlers |
| Auth | Supabase Auth via @supabase/ssr | Bundled with the database; Row Level Security at the DB layer eliminates separate authorization logic; scaffolded in Plan 02, login UI deferred to Phase 4 |
| Deployment target | Vercel (local `npm run dev` for Phase 1) | Zero-config Next.js deployment; serverless functions for Route Handlers; documented local run command: `npm run dev` |
| Directory layout | src/ with lib/db, lib/google, lib/validation, app/api, components | lib/ separates shared server logic from route handlers; app/ follows Next.js App Router conventions; components/ for client components |
| Google API | Places API (New) only — `places.googleapis.com/v1` | Feature-frozen legacy `/maps/api/place/` deprecated; new API has Chinese support, uses `places[]` response array, and supports field masking for cost control |
| API key model | Two separate keys: browser-restricted (Maps JS only) + server-restricted (Places + Routes only) | Prevents server keys from leaking to the browser bundle; enforced by NEXT_PUBLIC_ prefix convention |

## Stack Touched in Phase 1 (Plan 01-01)

- [x] Project scaffold — Next.js 15 App Router, TypeScript 5.x, Tailwind CSS v4 (zero-config), Drizzle ORM, Supabase client, Zod, TanStack Query, Vitest test runner
- [x] Routing — POST /api/places/resolve Route Handler + home page route at /
- [x] Database — places table created (0000_places.sql); real upsert via onConflictDoUpdate keyed on place_id
- [x] UI — PlaceResolverForm client component wired to /api/places/resolve; displays resolved displayName + formattedAddress
- [x] Deployment — local dev server via `npm run dev`; Vercel deploy documented for subsequent plans

## Out of Scope (Deferred to Later Slices)

### Deferred to Plan 01-02
- Other database tables: `itineraries`, `itinerary_days`, `place_visits`
- Row Level Security (RLS) policies for all tables
- Supabase Auth scaffold (createServerClient/createBrowserClient, middleware.ts, getUser())

### Deferred to Plan 01-03
- Cache-first GET /api/places/details endpoint
- Opening hours fetch (Enterprise SKU regularOpeningHours)
- Visit duration derivation from place types (lookup table)
- hours_unknown flag enforcement and UI warning

### Deferred to Plan 01-04
- Google Maps URL resolution (short URL redirect following, lat/lng extraction)
- GCP billing alerts ($10/$50/$100 thresholds)
- Hard daily quota cap in GCP Console
- Per-user rate limiting (50 searches/day) — Phase 5

### Deferred to Phase 3 (Core UI)
- PlaceInput, ItineraryView, MapView components
- Interactive Google Maps display
- Mobile-responsive layout

### Deferred to Phase 4 (Auth + Persistence)
- Login/registration UI pages
- Save/load itinerary persistence
- Public share link endpoint

### Deferred to Phase 5 (Polish)
- 300ms debounce on frontend
- Drag-and-drop reorder
- Manual visit duration override

## Subsequent Slice Plan

Each later plan/phase adds one vertical slice on top of this skeleton without renegotiating the architectural decisions above:

- **Phase 1, Plan 02**: Full schema (itineraries/itinerary_days/place_visits) + RLS policies + Supabase auth scaffold
- **Phase 1, Plan 03**: Cache-first GET /api/places/details + visit duration lookup table + hours_unknown rule
- **Phase 1, Plan 04**: Google Maps URL resolution + GCP cost controls (billing alerts + daily quota cap)
- **Phase 2**: Server-side TSP optimizer (nearest-neighbor + 2-opt + greedy bin-packing) — POST /api/optimize
- **Phase 3**: Full UI — PlaceInput, ItineraryView, MapView, mobile-responsive end-to-end anonymous flow
- **Phase 4**: Supabase Auth login UI + saved itineraries + public share links
- **Phase 5**: Rate limiting, 300ms debounce, mobile polish, manual visit duration override
