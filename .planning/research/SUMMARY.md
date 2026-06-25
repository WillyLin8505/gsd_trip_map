# Project Research Summary

**Project:** Travel Itinerary Planner (旅遊行程規劃器)
**Synthesized:** 2026-06-25
**Research files:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall Confidence:** MEDIUM

---

## Executive Summary

This is a paste-to-plan travel itinerary web application. The user provides a list of destinations (Chinese names or Google Maps URLs), and the system automatically resolves place details via the Google Places API, then produces a multi-day schedule that respects opening hours, minimizes travel distance, and assigns time slots per stop. The product's core differentiation is being the only tool in the market that simultaneously optimizes for geography AND opening-hour constraints on a user-provided list — competitors either require manual ordering (Wanderlog) or generate the list themselves instead of optimizing it (Mindtrip).

The recommended approach is a Next.js 15 App Router monorepo on Vercel, backed by Supabase (PostgreSQL + Auth), with all Google API calls proxied server-side through Next.js Route Handlers. The optimization engine is a pure TypeScript nearest-neighbor + 2-opt heuristic with greedy bin-packing for multi-day splitting — this runs in under 50ms for typical inputs (N≤30 stops) with no external dependencies beyond the Google Routes API for the travel-time distance matrix.

The primary risk is Google API cost without field masking and caching. A shared places table acting as a cross-user cache, combined with mandatory field masks on every API call and hard quota caps in GCP Console, are the non-negotiable mitigations that must be built into Phase 1 before any user traffic is accepted.

---

## Key Findings

### Recommended Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Next.js (App Router) | 15.x | Full-stack BFF pattern; server components keep API keys out of browser |
| Language | TypeScript | 5.x | Required for complex itinerary data models and type-safe ORM queries |
| Maps | @vis.gl/react-google-maps | ^1.x | Official Google Maps React wrapper (replaces archived alternatives) |
| Maps data | Google Places API (New) | REST | Widest coverage, Chinese name support; use New API only — legacy is feature-frozen |
| Routing | Google Routes API | REST | Replaced Directions API March 2025; native waypoint optimization up to 25 stops |
| Auth | Supabase Auth | bundled | Native PostgreSQL RLS integration eliminates application-level auth filtering bugs |
| Database | Supabase (PostgreSQL 15+) | managed | JSON columns, full-text search, relational hierarchy; bundled auth reduces services |
| ORM | Drizzle ORM | ^0.33.x | 45ms cold start vs Prisma 320ms; 7.4KB bundle vs 180KB; critical for serverless |
| Styling | Tailwind CSS | v4.x | Zero-config in v4 |
| Components | shadcn/ui | latest | Accessible Radix-based components; copy-paste model avoids version lock-in |
| Deployment | Vercel + Supabase | — | One-command deploy; free tiers cover early traction |
| State | TanStack Query | ^5.x | Client-side caching of Places API results and itinerary data |
| Validation | Zod | ^3.x | Schema validation for all external inputs and API responses |

Critical version notes: Auth.js (NextAuth v5) is in maintenance mode — do not use. PlanetScale eliminated free tier — do not use. Realistic cost at 1,000 active users/month: ~$165/month. Set billing alerts at $10/$50/$100 before any user traffic.

---

### Table Stakes Features

Must ship in v1 or product has no value:

1. Paste/type list of places — accepts Chinese names AND Google Maps URLs
2. Auto-resolve place details via Google Places API — name to hours, coordinates, address
3. Visit duration estimation by place type — heuristic table; user-overridable
4. Opening-hours-aware multi-day scheduling — core differentiator; greedy TOPTW approach
5. Day-by-day itinerary display with time slots — "Day 1: 09:00-11:00 at X, 12:00-13:00 at Y"
6. Interactive map view — daily color-coded pins and route polylines
7. Account auth — email/password + Google OAuth
8. Save + share — persist multiple itineraries; public read-only share link via UUID token
9. Mobile-responsive layout — RWD; users check itineraries on phone while traveling
10. Auto-suggest number of days — derived from total visit durations + travel time estimate

Deferred to v2: drag-and-drop reorder, PDF export, geographic clustering for cross-city trips, place photos.

Confirmed anti-features (never build): flight/hotel booking integration, real-time ticket prices, native mobile app, budget tracking, group voting, AI place recommendations, social feed.

---

### Architecture Approach

Pattern: Three-tier monorepo. React/Next.js client — Next.js App Router server layer — Supabase PostgreSQL.

All Google API calls are proxied through Next.js Route Handlers. No API keys reach the browser.

Core API surface:
- POST /api/places/resolve — resolve name/URL to placeId
- GET /api/places/details — fetch opening hours, coords, duration (cache-first, 30-day TTL)
- POST /api/optimize — run TSP + day-split, return structured itinerary
- POST /api/itineraries — save with auth check + share token generation
- GET /api/itineraries/:id — load itinerary (auth check)
- GET /api/share/:token — public share (no auth, visibility check required)

Optimization algorithm (pure TypeScript, zero external deps):
1. Nearest-neighbor construction — O(N²), feasibility-checked against opening hours
2. 2-opt improvement — 3-5 passes, reject swaps that violate time windows
3. Greedy bin-packing day split — accumulate visitDuration + travelTime; overflow starts new day
4. Schedule times — walk each day's POI sequence, compute arrival/departure respecting opening windows
5. Google Routes API computeRouteMatrix provides the NxN travel-time input

Runs in <50ms for N≤30. For N>30, chain Google Routes API optimizeWaypointOrder in segments of 25.

Data model hierarchy: users → itineraries → itinerary_days → place_visits → places (shared cache)

The places table is a cross-user shared cache. One Google API fetch per place_id benefits all users. Supabase RLS enforces itinerary ownership at the DB layer.

---

### Critical Pitfalls to Avoid

Pitfall 1 — Google Places API cost explosion (CRITICAL)
Never omit the X-Goog-FieldMask header. Requesting all fields defaults to the most expensive SKU tier. Set field mask on every API call from the first line of code. Implement the shared places cache before any user-facing feature ships. Set GCP billing alerts and hard daily quota cap before going live.

Pitfall 2 — Legacy Places API (CRITICAL)
Any URL containing /maps/api/place/ is the deprecated legacy API (feature-frozen March 2025). Use places.googleapis.com/v1/places exclusively. Verify all npm dependencies reference the new API.

Pitfall 3 — Opening hours data is unreliable (CRITICAL)
Many places have no regularOpeningHours field. Do NOT treat absent hours as "always open." Flag with hoursUnknown: true and display a warning. Store opening hours as structured JSONB (regularOpeningHours.periods array), never as freetext — the optimizer cannot use freetext.

Pitfall 4 — Nearest-neighbor without 2-opt (HIGH)
Shipping nearest-neighbor alone produces visibly bad routes with crossings. Always follow with 2-opt improvement. Render route polyline on map during development — visual inspection immediately exposes bad routes.

Pitfall 5 — Chinese place name ambiguity (HIGH)
"故宮" matches both Taipei and Beijing. Always require user to specify destination city before place lookup and apply that city's bounding box as locationBias on every Text Search call. Show matched place address for user confirmation before adding to itinerary.

Pitfall 6 — Sharing link without visibility enforcement (MEDIUM)
The is_public field must be checked server-side on every share link access. A UI "make private" toggle not wired to the API check is an IDOR vulnerability. Use UUIDv4 for all IDs — never sequential integers.

Pitfall 7 — No rate limiting (MEDIUM)
Each place lookup triggers a Google API call. Without server-side per-user rate limiting, a script can exhaust daily quota in minutes. Require authentication for all API-proxying endpoints. Add 300ms debounce on frontend and a per-user daily call cap on the server.

---

## Implications for Roadmap

Research across all 4 files consistently points to the same dependency chain. The recommended phase order is:

### Phase 1: Foundation + API Integration Spike

Rationale: All other features depend on Google Places API integration being correct and cost-controlled. DB schema and RLS must exist before any data can be saved. Auth must be scaffolded before Phase 4 save/share features.

Delivers: Working infrastructure — schema, auth scaffold, Places API resolution with caching, cost controls in place.

Features: DB schema (places cache + itinerary hierarchy), Supabase Auth setup, POST /api/places/resolve with locationBias, GET /api/places/details with 30-day cache + field masking, GCP billing alerts + quota cap.

Must avoid: Pitfall 1 (no field mask), Pitfall 2 (legacy API), Pitfall 5 (no location bias on Text Search).

Research flag: Standard patterns — no additional research needed.

---

### Phase 2: Optimization Engine

Rationale: The scheduling algorithm is the core product value. It must be built and validated before the UI is designed around its output format. Algorithm correctness must be verified with test cases before the UI exposes it to users.

Delivers: Server-side optimizer producing structured day-by-day schedules from place lists.

Features: Google Routes API computeRouteMatrix, nearest-neighbor + 2-opt TypeScript implementation, opening-hours-aware scheduling, greedy bin-packing day split, POST /api/optimize, visit duration heuristic table by place type.

Must avoid: Pitfall 3 (missing hours treated as open), Pitfall 4 (no 2-opt), Pitfall 8 (timezone bugs — store utcOffsetMinutes alongside opening hours).

Research flag: Algorithm correctness needs careful testing. Recommend test suite with known-correct outputs for 3-5 representative itinerary scenarios before UI build.

---

### Phase 3: Core UI — Input + Itinerary Display + Map

Rationale: Once the optimizer produces correct output, build the UI to expose it. The three primary client components (PlaceInput, ItineraryView, MapView) depend on Phase 1 API and Phase 2 optimizer being functional.

Delivers: Full end-to-end working product flow for an anonymous user (no save/share yet).

Features: PlaceInput UI (paste + resolve + confirm), ItineraryView (day cards with time slots), MapView (per-day colored polylines, numbered markers), loading state with progress steps, hoursUnknown warnings in UI, mobile-responsive layout.

Must avoid: Pitfall 9 (map re-render on every state change — memoize polyline/marker components; one DirectionsRenderer per day, not one for all days).

Research flag: Standard patterns — Next.js + @vis.gl/react-google-maps are well-documented.

---

### Phase 4: Auth + Persistence + Sharing

Rationale: Save and share depend on the full auth flow. Persistence ships here, once the UI is validated in Phase 3.

Delivers: User accounts, saved itineraries, and public share links.

Features: Registration/login UI (email + Google OAuth), save/load itinerary CRUD, share token generation (UUIDv4), is_public visibility enforcement server-side on every share endpoint, itinerary list dashboard, GET /api/share/:token.

Must avoid: Pitfall 6 (visibility not enforced server-side), store original query string alongside place_id for re-resolution fallback on NOT_FOUND.

Research flag: Standard patterns — Supabase Auth + RLS patterns are well-documented.

---

### Phase 5: Polish + Edit + Cost Hardening

Rationale: Manual override and polish features are differentiators, not table stakes. Defer until core flow is validated with real users.

Delivers: Editing capabilities, mobile polish, rate limiting, and cost safety net.

Features: Manual reorder/edit of day assignments, regenerate button, server-side per-user rate limiting (50 searches/day), input debounce (300ms), meal-time slot bias in algorithm (soft-block 12:00-13:30 and 18:00-19:30), PDF/print export.

Must avoid: Pitfall 12 (no rate limiting), Pitfall 11 (meals treated as optional extras by algorithm).

Research flag: Drag-and-drop reorder UX needs design attention — no standard itinerary day-reassignment pattern exists.

---

### Phase Order Summary

| Phase | Name | Key Deliverable | Research Needed |
|-------|------|----------------|----------------|
| 1 | Foundation + API Integration | DB schema, auth scaffold, Places API with cache + cost controls | No |
| 2 | Optimization Engine | Server-side TSP scheduler producing day-by-day output | Test suite recommended |
| 3 | Core UI | Full end-to-end anonymous user flow | No |
| 4 | Auth + Persistence + Sharing | User accounts, saved itineraries, public links | No |
| 5 | Polish + Edit + Cost Hardening | Manual edit, rate limiting, print export | Design for drag-and-drop |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Stack | MEDIUM-HIGH | Official library docs cross-checked; pricing verified against Google March 2025 pricing page |
| Features | MEDIUM | Competitor analysis cross-checked; TOPTW framing backed by peer-reviewed MDPI paper; visit duration heuristics are estimates |
| Architecture | MEDIUM | Data model and API patterns are standard; TSP algorithm quality claims backed by academic sources |
| Pitfalls | MEDIUM | API cost pitfalls sourced from official Google billing docs; algorithm pitfalls based on established TSP literature |

Gaps to address during planning:
- Visit duration defaults by place type are heuristics — validate against real Taiwan trips during Phase 3
- Opening hours coverage rate for Taiwanese attractions is unknown — test empirically in Phase 1 spike
- Cross-city geographic clustering (e.g., 台北 → 台中 → 高雄) is deferred to v2, but data model should support it from Phase 1 to avoid schema migrations later
- Google Maps short URL parsing (requires redirect resolution) needs implementation spike in Phase 1 — referenced regex patterns are LOW confidence

---

## Sources

Aggregated from STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md. Key primary sources:

- Google Maps Platform Pricing — official, verified June 2025
- Google Routes API Usage and Billing — official
- Places API (New) overview — official
- Places API Legacy Deprecation timeline — official
- @vis.gl/react-google-maps — official Google-backed library
- Next.js App Router docs — official
- Supabase Pricing — official
- Drizzle vs Prisma — makerkit.dev
- Optimized Travel Itineraries TOPTW — MDPI Algorithms (peer-reviewed)
- KomoTrip multi-day itinerary algorithm — PeerJ cs-3350 (peer-reviewed)
- Wanderlog, TripIt, Sygic Travel, Mindtrip competitor analysis — mightytravels.com
- JWT Best Practices — Curity
- Supabase RLS documentation — official
