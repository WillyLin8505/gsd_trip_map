# Technology Stack

**Project:** Travel Itinerary Planner (旅遊行程規劃器)
**Researched:** 2026-06-25
**Overall Confidence:** MEDIUM (web sources cross-checked, official pricing confirmed)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (App Router) | Full-stack React framework | App Router is now stable, provides server components for SSR, Route Handlers replace REST API endpoints, zero-config TypeScript, ideal for auth + API-heavy apps |
| React | 19.x | UI rendering | Required by Next.js 15; concurrent features improve map interactivity |
| TypeScript | 5.x | Type safety | De-facto standard; critical for complex data models (itinerary, places, routes) |

**Why Next.js over alternatives:** A separate backend (FastAPI, Express) adds operational complexity for what is essentially a BFF (backend-for-frontend) pattern. Next.js Route Handlers handle Google API proxying, auth session validation, and DB access in the same repo. Vercel deployment is one-command.

**Why App Router over Pages Router:** App Router is the Vercel-recommended default as of Next.js 15. Server Components avoid sending Google API keys to the browser. RSC security patches landed throughout 2025 and are now stable. Pages Router only makes sense for teams already on it.

---

### Maps and Geospatial

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @vis.gl/react-google-maps | ^1.x | Interactive map display in React | Official Google Maps Platform React wrapper (replaces archived @googlemaps/react-wrapper). Provides `<Map>`, `<AdvancedMarker>`, Polyline components and hooks. Actively maintained by vis.gl + Google. |
| Google Maps JavaScript API | — (loaded by above) | Map rendering, marker display, route polylines | Required for the above library; same billing account as Places and Routes APIs, simplifying cost management |
| Google Places API (New) | REST | Fetching place name, address, opening hours, photos | Widest global coverage, Chinese place name support, integrates with Maps ecosystem. **See cost implications below.** |
| Google Routes API | REST | Travel time matrix between places, waypoint ordering | Replaced Directions API in March 2025. Supports `optimizeWaypointOrder: true` for up to 25 waypoints natively. Use this instead of Directions API (now Legacy). |

**Why Google Maps JS API over Mapbox GL JS:**
Mapbox is 3x cheaper per map load and has better custom styling. However, this app lives and dies on Google Places data (opening hours, Chinese names, global coverage). Using Mapbox for the map display while calling Google Places API requires maintaining two API billing accounts and two SDKs. The tighter integration of Google Maps JS API + Places + Routes in a single ecosystem reduces complexity and eliminates cross-origin data-licensing concerns. Accept the higher map-load cost; offset it with aggressive caching of Places API responses.

**Why not Leaflet:**
Leaflet is free but requires a separate geocoding service (Nominatim), a separate routing service (OSRM/Valhalla), and has no native Places data. Building three-service integration defeats the purpose.

#### Google API Cost Implications (CRITICAL — read before launch)

Pricing model changed March 1, 2025. Old $200/month credit is gone. Now free usage caps per SKU:

| API / SKU | Free Cap / Month | Cost Beyond Free |
|-----------|-----------------|-----------------|
| Places (New) — Essentials (name, address, hours) | 10,000 requests | $5.00 / 1,000 |
| Places (New) — Pro (photos, reviews) | 5,000 requests | $17.00 / 1,000 |
| Routes API — Essentials (compute route, optimize waypoints ≤10 intermediate) | 5,000 requests | ~$5.00 / 1,000 |
| Maps JS API — Dynamic Maps | 10,000 loads | ~$7.00 / 1,000 |

**Cost mitigation strategy (mandatory):**
1. Cache all Places API responses in your database. A place's opening hours change rarely. Cache for 7–30 days per place_id. This is the single most effective cost reduction.
2. Use field masks (`fields` parameter) to request only needed fields. Requesting `displayName,regularOpeningHours,priceLevel` keeps you in Essentials tier ($5/1K) instead of Pro ($17/1K).
3. Fetch place details server-side (Route Handlers) so API keys never reach the browser.
4. Set Google Cloud billing alerts at $10, $50, $100.
5. For route optimization, call Routes API once per itinerary generation, not per page load. Cache the result with the saved itinerary.

**Realistic cost at 1,000 active users/month generating ~3 itineraries each:**
- ~3,000 route optimizations: falls within free tier
- ~15,000 place detail lookups (first lookup per place): ~$25/month after caching (most users share popular destinations)
- Map loads: ~30,000 loads: ~$140/month
- **Estimated total: ~$165/month at 1K active users** — deploy billing cap early.

---

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Auth | (bundled with Supabase) | User accounts, sessions, OAuth | Bundled with the database (see below). Row Level Security in PostgreSQL handles itinerary access control at the DB layer — no separate authorization logic in application code. 50,000 MAU on free tier. |

**Why Supabase Auth over Clerk:**
Clerk is faster to set up and has better pre-built UI components (good if shipping in 1 day). However, Supabase Auth integrates natively with PostgreSQL Row Level Security, meaning `SELECT * FROM itineraries WHERE user_id = auth.uid()` just works without application-level filtering. For a data-model-heavy app like this itinerary planner, this eliminates an entire class of authorization bugs. Use Supabase Auth.

**Why not Auth.js (NextAuth v5):** Auth.js is in maintenance mode as of 2025, no longer actively developed. Avoid for new projects.

---

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase | (managed PostgreSQL 15+) | Primary database: users, itineraries, places cache | PostgreSQL is the right engine for this app's data: JSON columns for flexible place data, full-text search for place names, relational modeling for user→itinerary→day→stop hierarchy. Supabase adds auth, connection pooling, and REST/realtime on top. Free tier: 500MB storage, 5GB bandwidth. |
| Drizzle ORM | ^0.33.x | Type-safe SQL query builder | 7.4 KB bundle vs Prisma's 180 KB. 45ms cold start vs 320ms. Next.js serverless functions benefit significantly. SQL-like API means queries map directly to what PostgreSQL executes — no ORM magic hiding N+1 problems. For a solo/small-team project, the lack of automated migrations (vs Prisma) is manageable with `drizzle-kit generate`. |

**Why Supabase over Neon + separate auth:**
Neon is a pure serverless Postgres and is slightly faster at cold starts. However, it requires a separate auth service (Clerk or Auth.js), which adds cost and integration complexity. Supabase's auth+DB bundle reduces services to manage.

**Why PostgreSQL over MySQL (PlanetScale):**
PlanetScale eliminated its free tier in 2024 (minimum $39/month) and is MySQL-based. PostgreSQL has better JSON support, window functions, and CTEs — all useful for itinerary data queries.

**Why Drizzle over Prisma:**
For a serverless Next.js deployment, Prisma 7 improved cold starts but is still ~7x slower than Drizzle. Drizzle's bundle is ~90% smaller. The SQL-like TypeScript API is explicit — you see exactly what query runs. Trade-off: Drizzle migrations are more manual than Prisma's `prisma migrate dev`, but `drizzle-kit` handles it adequately.

---

### Route Optimization

| Technology | Purpose | Why |
|------------|---------|-----|
| Google Routes API (`optimizeWaypointOrder: true`) | Reorder waypoints for shortest travel time within a single-day cluster | Native waypoint optimization up to 25 intermediate stops. No external library needed for the ordering problem. Free up to 5,000 requests/month. |
| Custom TypeScript: Nearest-neighbor + 2-opt | Day-splitting algorithm (cluster stops by operating hours into N days) | No mature JavaScript TSP-with-time-windows library exists. Typical itinerary has 5–20 attractions — feasible for O(n²) nearest-neighbor. Day boundaries determined by: summing visit durations, checking opening hours, enforcing a ~10-hour daily limit. |

**Implementation plan:**
1. Fetch all place details (opening hours, estimated visit duration) from Places API — cache in DB.
2. Run custom day-splitting: greedily assign stops to days respecting opening hours and total daily hours.
3. For each day's stop list, call Routes API with `optimizeWaypointOrder: true` to get the optimal visit sequence.
4. Render the ordered day lists on the map as colored polylines.

**Why not a third-party routing SaaS (Routific, TomTom, etc.):**
They add cost and vendor dependency. For N≤25 attractions, Google Routes API + custom heuristic is sufficient and keeps the Google ecosystem tight.

---

### Frontend UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | v4.x | Styling | Zero-config (no `tailwind.config.ts` needed in v4), inline theming, pairs perfectly with Next.js 15 |
| shadcn/ui | latest | Component library | Accessible components built on Radix primitives. Copy-paste model means no version lock-in. First-class Next.js App Router + Tailwind v4 support. |
| Lucide React | ^0.400.x | Icons | shadcn/ui default icon set; tree-shakeable |
| next-themes | ^0.3.x | Dark mode | Standard for shadcn/ui dark mode |

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/ssr | ^0.5.x | Supabase client for Next.js server/client boundary | Always — replaces deprecated @supabase/auth-helpers-nextjs |
| @supabase/supabase-js | ^2.x | Supabase JS client | Always |
| drizzle-orm | ^0.33.x | ORM queries | Always |
| drizzle-kit | ^0.24.x | Migration generation | Dev dependency |
| postgres (pg driver) | ^3.x | PostgreSQL driver for Drizzle | Always (Drizzle requires explicit driver) |
| zod | ^3.x | Schema validation | Validate all external inputs: user-submitted place lists, API responses |
| @tanstack/react-query | ^5.x | Server state management | Caching Places API results client-side, managing itinerary fetch/refetch |
| nanoid | ^5.x | Short unique IDs for share links | Generate short public share tokens (e.g., `/share/abc123`) |
| date-fns | ^3.x | Date manipulation | Parsing opening hours, calculating day boundaries |

---

### Deployment

| Technology | Purpose | Why |
|------------|---------|-----|
| Vercel | Hosting Next.js app | Zero-config Next.js deployment. Serverless functions for Route Handlers. Edge Network CDN. Free tier supports hobby projects with 100GB bandwidth. |
| Supabase | Managed PostgreSQL + Auth | Free tier: 500MB DB, 50K MAU. Upgrade to Pro ($25/month) when pausing behavior on free tier becomes a problem (free projects pause after 7 days inactivity). |
| Vercel Environment Variables | Secret management | Store `GOOGLE_MAPS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose service role key to browser. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Map library | Google Maps JS API | Mapbox GL JS | Mapbox cheaper per map load, but maintaining two API ecosystems (Mapbox + Google Places) adds complexity. Single-vendor simplicity wins for v1. |
| Map library | Google Maps JS API | Leaflet | Free but no native places/routing. Three separate service integrations needed. |
| Auth | Supabase Auth | Clerk | Clerk has better pre-built UI but lacks native DB-level RLS integration. More services to pay for separately. |
| Auth | Supabase Auth | Auth.js v5 | In maintenance mode as of 2025. No active development. |
| ORM | Drizzle | Prisma | Prisma 7 improved but still ~7x slower cold start and 24x larger bundle. Not ideal for serverless. |
| Database | Supabase (PostgreSQL) | PlanetScale | Eliminated free tier in 2024. MySQL engine less suited to this use case. |
| Database | Supabase | Neon | Neon is excellent serverless Postgres, but lacks integrated auth — requires Clerk/Auth.js adding cost and services. |
| Route optimization | Google Routes API + custom TS | Third-party TSP SaaS (Routific) | Routific costs $39+/month and introduces vendor dependency. Google Routes API native waypoint optimization handles the N≤25 case for free. |
| Backend | Next.js Route Handlers | FastAPI + separate frontend | Two repos, two deployments, two languages. Unnecessary complexity for this use case. |

---

## Installation

```bash
# Scaffold project
npx create-next-app@latest gsd-food-map \
  --typescript \
  --tailwind \
  --app \
  --import-alias "@/*"

# Maps
npm install @vis.gl/react-google-maps

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# ORM
npm install drizzle-orm postgres
npm install -D drizzle-kit

# UI components (run shadcn init separately)
npx shadcn@latest init
npm install next-themes lucide-react

# Utilities
npm install @tanstack/react-query zod nanoid date-fns

# Type checking for Google Maps types
npm install -D @types/google.maps
```

---

## Google API Key Setup

**Required APIs to enable in Google Cloud Console:**
1. Maps JavaScript API
2. Places API (New)
3. Routes API

**Key restrictions:**
- Browser-side key: restrict to HTTP referrers (your domain) + Maps JavaScript API only
- Server-side key: restrict to IP + Places API (New) + Routes API
- Never use the same key for both — server key must stay in environment variables, never in client bundle

---

## Sources

- [Google Maps Platform Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) — official pricing page, verified June 2025
- [Google Routes API Usage and Billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [@vis.gl/react-google-maps npm](https://www.npmjs.com/package/@vis.gl/react-google-maps)
- [vis.gl/react-google-maps GitHub](https://github.com/visgl/react-google-maps)
- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Supabase Pricing](https://supabase.com/pricing)
- [Drizzle vs Prisma comparison — makerkit.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)
- [Better Auth vs Clerk vs NextAuth vs Supabase Auth — makerkit.dev](https://makerkit.dev/blog/tutorials/better-auth-vs-clerk)
- [Neon vs Supabase vs PlanetScale — DEV Community](https://dev.to/whoffagents/neon-vs-supabase-vs-planetscale-managed-postgres-for-nextjs-in-2026-2el4)
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next)
