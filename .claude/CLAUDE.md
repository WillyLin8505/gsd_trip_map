<!-- GSD:project-start source:PROJECT.md -->

## Project

**Travel Itinerary Planner（旅遊行程規劃器）**

一個開放給一般使用者的 Web 旅遊行程規劃工具。使用者貼上景點和餐廳清單（中文名稱或 Google Maps 連結），系統自動透過 Google Places API 帶入營業時間、門票資訊、建議遊覽時長，再同時考慮地理距離與營業時間限制，自動排出最佳多天行程，並以逐天行程表 + 互動地圖呈現結果。

**Core Value:** **讓使用者省去「手動查資料 + 手動排順序」的麻煩**——貼上清單就能得到一份可直接執行的最佳化行程。
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (App Router) | Full-stack React framework | App Router is now stable, provides server components for SSR, Route Handlers replace REST API endpoints, zero-config TypeScript, ideal for auth + API-heavy apps |
| React | 19.x | UI rendering | Required by Next.js 15; concurrent features improve map interactivity |
| TypeScript | 5.x | Type safety | De-facto standard; critical for complex data models (itinerary, places, routes) |

### Maps and Geospatial

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @vis.gl/react-google-maps | ^1.x | Interactive map display in React | Official Google Maps Platform React wrapper (replaces archived @googlemaps/react-wrapper). Provides `<Map>`, `<AdvancedMarker>`, Polyline components and hooks. Actively maintained by vis.gl + Google. |
| Google Maps JavaScript API | — (loaded by above) | Map rendering, marker display, route polylines | Required for the above library; same billing account as Places and Routes APIs, simplifying cost management |
| Google Places API (New) | REST | Fetching place name, address, opening hours, photos | Widest global coverage, Chinese place name support, integrates with Maps ecosystem. **See cost implications below.** |
| Google Routes API | REST | Travel time matrix between places, waypoint ordering | Replaced Directions API in March 2025. Supports `optimizeWaypointOrder: true` for up to 25 waypoints natively. Use this instead of Directions API (now Legacy). |

#### Google API Cost Implications (CRITICAL — read before launch)

| API / SKU | Free Cap / Month | Cost Beyond Free |
|-----------|-----------------|-----------------|
| Places (New) — Essentials (name, address, hours) | 10,000 requests | $5.00 / 1,000 |
| Places (New) — Pro (photos, reviews) | 5,000 requests | $17.00 / 1,000 |
| Routes API — Essentials (compute route, optimize waypoints ≤10 intermediate) | 5,000 requests | ~$5.00 / 1,000 |
| Maps JS API — Dynamic Maps | 10,000 loads | ~$7.00 / 1,000 |

- ~3,000 route optimizations: falls within free tier
- ~15,000 place detail lookups (first lookup per place): ~$25/month after caching (most users share popular destinations)
- Map loads: ~30,000 loads: ~$140/month
- **Estimated total: ~$165/month at 1K active users** — deploy billing cap early.

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Auth | (bundled with Supabase) | User accounts, sessions, OAuth | Bundled with the database (see below). Row Level Security in PostgreSQL handles itinerary access control at the DB layer — no separate authorization logic in application code. 50,000 MAU on free tier. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase | (managed PostgreSQL 15+) | Primary database: users, itineraries, places cache | PostgreSQL is the right engine for this app's data: JSON columns for flexible place data, full-text search for place names, relational modeling for user→itinerary→day→stop hierarchy. Supabase adds auth, connection pooling, and REST/realtime on top. Free tier: 500MB storage, 5GB bandwidth. |
| Drizzle ORM | ^0.33.x | Type-safe SQL query builder | 7.4 KB bundle vs Prisma's 180 KB. 45ms cold start vs 320ms. Next.js serverless functions benefit significantly. SQL-like API means queries map directly to what PostgreSQL executes — no ORM magic hiding N+1 problems. For a solo/small-team project, the lack of automated migrations (vs Prisma) is manageable with `drizzle-kit generate`. |

### Route Optimization

| Technology | Purpose | Why |
|------------|---------|-----|
| Google Routes API (`optimizeWaypointOrder: true`) | Reorder waypoints for shortest travel time within a single-day cluster | Native waypoint optimization up to 25 intermediate stops. No external library needed for the ordering problem. Free up to 5,000 requests/month. |
| Custom TypeScript: Nearest-neighbor + 2-opt | Day-splitting algorithm (cluster stops by operating hours into N days) | No mature JavaScript TSP-with-time-windows library exists. Typical itinerary has 5–20 attractions — feasible for O(n²) nearest-neighbor. Day boundaries determined by: summing visit durations, checking opening hours, enforcing a ~10-hour daily limit. |

### Frontend UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | v4.x | Styling | Zero-config (no `tailwind.config.ts` needed in v4), inline theming, pairs perfectly with Next.js 15 |
| shadcn/ui | latest | Component library | Accessible components built on Radix primitives. Copy-paste model means no version lock-in. First-class Next.js App Router + Tailwind v4 support. |
| Lucide React | ^0.400.x | Icons | shadcn/ui default icon set; tree-shakeable |
| next-themes | ^0.3.x | Dark mode | Standard for shadcn/ui dark mode |

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

### Deployment

| Technology | Purpose | Why |
|------------|---------|-----|
| Vercel | Hosting Next.js app | Zero-config Next.js deployment. Serverless functions for Route Handlers. Edge Network CDN. Free tier supports hobby projects with 100GB bandwidth. |
| Supabase | Managed PostgreSQL + Auth | Free tier: 500MB DB, 50K MAU. Upgrade to Pro ($25/month) when pausing behavior on free tier becomes a problem (free projects pause after 7 days inactivity). |
| Vercel Environment Variables | Secret management | Store `GOOGLE_MAPS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose service role key to browser. |

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

## Installation

# Scaffold project

# Maps

# Supabase

# ORM

# UI components (run shadcn init separately)

# Utilities

# Type checking for Google Maps types

## Google API Key Setup

- Browser-side key: restrict to HTTP referrers (your domain) + Maps JavaScript API only
- Server-side key: restrict to IP + Places API (New) + Routes API
- Never use the same key for both — server key must stay in environment variables, never in client bundle

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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
