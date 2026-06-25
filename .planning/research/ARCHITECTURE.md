# Architecture Patterns

**Project:** Travel Itinerary Planner (旅遊行程規劃器)
**Researched:** 2026-06-25
**Confidence:** MEDIUM (cross-checked across official Google docs, academic TSP literature, Next.js patterns)

---

## Recommended Architecture

A three-tier web application: React/Next.js client, Next.js App Router server layer, PostgreSQL/Supabase persistence. All Google API calls are proxied server-side — no API keys in the browser.

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                                   │
│                                                                     │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │  PlaceInput UI   │   │  ItineraryView   │   │  MapView       │  │
│  │  (paste names /  │   │  (day-by-day     │   │  (Google Maps  │  │
│  │   Maps URLs)     │   │   schedule)      │   │   JS API)      │  │
│  └────────┬─────────┘   └────────┬─────────┘   └───────┬────────┘  │
│           │                      │                      │           │
│           └──────────────────────┼──────────────────────┘           │
│                                  │ HTTP (fetch)                     │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────┐
│  NEXT.JS APP ROUTER (Server)     │                                  │
│                                  ▼                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Route Handlers  (app/api/*)                                   │ │
│  │                                                                │ │
│  │  POST /api/places/resolve   ← resolve name/URL → placeId      │ │
│  │  GET  /api/places/details   ← fetch hours, coords, duration   │ │
│  │  POST /api/optimize         ← run TSP + day-split             │ │
│  │  POST /api/itineraries      ← save itinerary                  │ │
│  │  GET  /api/itineraries/:id  ← load itinerary                  │ │
│  │  GET  /api/share/:token     ← public share (no auth)          │ │
│  └──────────────┬────────────────────────────┬─────────────────┘  │
│                 │                            │                     │
│  ┌──────────────▼──────────┐   ┌────────────▼──────────────────┐  │
│  │  PlacesService          │   │  OptimizerService              │  │
│  │  - resolve(query/url)   │   │  - buildDistanceMatrix()       │  │
│  │  - getDetails(placeId)  │   │  - nearestNeighbor()           │  │
│  │  - cacheLayer (DB)      │   │  - twoOptImprove()             │  │
│  └──────────────┬──────────┘   │  - splitIntoDays()             │  │
│                 │              └────────────┬──────────────────┘  │
└─────────────────┼───────────────────────────┼─────────────────────┘
                  │                           │
       ┌──────────┼───────────────────────────┼──────────┐
       │          │   EXTERNAL APIS           │          │
       │          ▼                           ▼          │
       │  ┌───────────────┐      ┌───────────────────┐  │
       │  │ Google Places │      │ Google Routes API  │  │
       │  │ API (New)     │      │ Compute Route      │  │
       │  │ Text Search   │      │ Matrix             │  │
       │  │ Place Details │      │ (travel time NxN)  │  │
       │  └───────────────┘      └───────────────────┘  │
       └─────────────────────────────────────────────────┘
                  │
       ┌──────────▼──────────────────────────────────────┐
       │  DATABASE (Supabase / PostgreSQL)               │
       │  Users, Itineraries, ItineraryDays,            │
       │  PlaceVisits, Places (cached API data)          │
       └─────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **PlaceInput UI** | Accept paste of place names (Chinese) or Google Maps URLs; send resolve request | `/api/places/resolve` |
| **ItineraryView** | Render day-by-day schedule: time slots, place names, durations | `/api/itineraries`, optimizer output |
| **MapView** | Render interactive Google Maps with per-day colored polylines; use `@vis.gl/react-google-maps` or `@react-google-maps/api`; must be `'use client'` | Maps JavaScript API (restricted key, HTTP referrer restricted) |
| **Route Handler: /api/places/resolve** | Resolve input to placeId. If URL: follow redirect, extract CID/coords, call Text Search by location. If Chinese text: call Text Search (New) with `textQuery` field. Return placeId list. | PlacesService |
| **Route Handler: /api/places/details** | Fetch place details from cache first, then Google Places API. Cache up to 30 days in `places` table. | PlacesService, DB |
| **Route Handler: /api/optimize** | Accept `[{placeId, openingHours, visitDuration, coords}]` + `numDays`. Run optimizer. Return structured itinerary. | OptimizerService |
| **PlacesService** | Thin wrapper around Google Places API (New). Manages field masks, handles caching reads/writes. Secret key lives here. | Google Places API, DB |
| **OptimizerService** | Pure function module: no external calls. Takes distance matrix + POI constraints, returns ordered visits grouped by day. | Routes API (for distance matrix input) |
| **Database** | Supabase PostgreSQL. Row Level Security enforces user ownership. `places` table is a shared cache across all users. | All server components |

---

## Data Flow

### Flow 1: User Submits Place List

```
User pastes list
       │
       ▼
PlaceInput UI
       │  POST /api/places/resolve  [{ raw: "台北101" }, { raw: "https://maps.app.goo.gl/..." }]
       ▼
Route Handler: /api/places/resolve
       │
       ├── For each URL input:
       │     HTTP HEAD → follow redirect → expanded URL
       │     Extract: /@lat,lng,zoom or ?cid=xxx from expanded URL
       │     If coords found → Text Search (New) with locationBias + place name
       │     If no coords → Text Search (New) with raw URL as textQuery (fallback)
       │
       └── For each text input:
             Text Search (New): { textQuery: "台北101", languageCode: "zh-TW" }
             Returns: [{ id: "ChIJ...", displayName, formattedAddress, location }]
       │
       ▼
Returns: [{ placeId, displayName, formattedAddress, location }]
       │
       ▼
Client shows confirmation list (user can remove/rename entries)
```

### Flow 2: Fetch Place Details + Build Distance Matrix

```
Confirmed placeId list
       │
       ▼
Route Handler: /api/places/details  (batched, one call per placeId)
       │
       ├── Check DB: SELECT * FROM places WHERE place_id = $1 AND updated_at > NOW() - INTERVAL '30 days'
       │     HIT → return cached row
       │     MISS → call Google Places API (New) Place Details:
       │             Fields: id, displayName, formattedAddress, location,
       │                     regularOpeningHours, priceLevel, rating
       │             (Enterprise SKU triggered by regularOpeningHours — unavoidable for this use case)
       │             Upsert result into places table
       │
       ▼
Returns array of PlaceDetail objects with:
  - placeId, name, coords {lat, lng}
  - openingHours: { periods: [{open: {day, hour, minute}, close: {day, hour, minute}}] }
  - visitDurationMinutes (default from category, overridable by user)
  - priceLevel, rating
       │
       ▼
Route Handler: /api/optimize (server-side)
  Internally calls Routes API: POST computeRouteMatrix
    origins: all N POI coords
    destinations: all N POI coords
    → Returns N×N travel time matrix (minutes)
```

### Flow 3: Route Optimization

```
Inputs:
  - N POIs with {coords, openingHours, visitDuration}
  - numDays (user-specified or auto-calculated)
  - dailyStartTime (default 09:00), dailyEndTime (default 21:00)
  - N×N travel time matrix

OptimizerService pipeline:
  ┌─────────────────────────────────────────────┐
  │  Step 1: Filter                              │
  │  Remove POIs closed on target travel dates   │
  │  (or flag for user review)                  │
  └──────────────────┬──────────────────────────┘
                     │
  ┌──────────────────▼──────────────────────────┐
  │  Step 2: Nearest Neighbor Construction       │
  │  Start from hotel/user location             │
  │  Greedily pick nearest unvisited POI that   │
  │  is reachable + open at estimated arrival   │
  │  time. Repeat until all POIs assigned.      │
  │  Complexity: O(N²)                          │
  └──────────────────┬──────────────────────────┘
                     │
  ┌──────────────────▼──────────────────────────┐
  │  Step 3: 2-opt Improvement                  │
  │  For each pair of edges, check if crossing  │
  │  is reversible to shorten route.            │
  │  Respect time-window feasibility after swap │
  │  Complexity: O(N²) per pass, run 3-5 passes │
  └──────────────────┬──────────────────────────┘
                     │
  ┌──────────────────▼──────────────────────────┐
  │  Step 4: Day Assignment (greedy bin-packing) │
  │  Walk optimized sequence in order           │
  │  Accumulate: travel time + visit duration   │
  │  If accumulated > daily budget → new day    │
  │  Each day starts fresh from previous day's  │
  │  last location (hotel or last POI)          │
  └──────────────────┬──────────────────────────┘
                     │
  ┌──────────────────▼──────────────────────────┐
  │  Step 5: Schedule Times                     │
  │  For each day, walk assigned POIs:          │
  │  arrivalTime = prevDepartureTime + travelTime│
  │  if arrivalTime < openTime → wait          │
  │  departureTime = max(arrivalTime,openTime)  │
  │              + visitDuration               │
  │  if departureTime > closeTime → skip to    │
  │    next day (edge case handling)           │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
  Output: [{day: 1, visits: [{placeId, arrivalTime, departureTime, travelFromPrev}]}]
```

### Flow 4: Persist + Display

```
Optimizer output
       │
       ▼
POST /api/itineraries
  - Auth check (Supabase JWT)
  - Insert: itineraries, itinerary_days, place_visits rows
  - Generate shareToken (UUID)
  - Return: itinerary with shareToken
       │
       ▼
Client: ItineraryView renders day cards + time slots
Client: MapView renders per-day routes
  - For each day: call DirectionsService with ordered waypoints
  - Render with DirectionsRenderer (polylineOptions.strokeColor per day)
  - Markers numbered per day order
```

---

## Key Algorithm Decisions

### TSP Approach: Nearest Neighbor + 2-opt (chosen over alternatives)

| Approach | Quality | Speed | Complexity | Verdict |
|----------|---------|-------|------------|---------|
| **Nearest Neighbor + 2-opt** | ~85-95% optimal | <100ms for N≤30 | Low | **USE THIS** |
| Exact (Held-Karp DP) | 100% optimal | Exponential, N>20 impractical | Very High | Reject |
| Ant Colony Optimization | ~95% optimal | Seconds for N=50 | Very High | Overkill |
| Google Routes API optimize_waypoints | Near-optimal | API latency ~300ms | Zero | Good fallback |
| OR-Tools (Google) | Near-optimal | Fast | Medium (Python/Node binding) | Consider for v2 |

**Decision: Nearest Neighbor + 2-opt runs entirely server-side in TypeScript, zero external dependencies, completes in <50ms for N≤30 POIs. For N>30, fall back to Google Routes API `optimize_waypoints` (max 25 waypoints per call, chain calls for larger sets).**

**Time-window enforcement strategy:**
- During Nearest Neighbor: check feasibility constraint at each candidate (can we arrive before closing time?)
- If no feasible next POI exists for current time slot, push violated POI to next day's candidate pool
- During 2-opt: after each swap, re-validate time-window feasibility; reject infeasible swaps

### Multi-Day Splitting Strategy

Use **greedy bin-packing** on the optimized single-route sequence:
- Daily budget = 12 hours (09:00–21:00) minus buffer
- Accumulate `visitDuration + travelTime` for each POI
- Overflow → start new day
- This preserves geographic clustering from 2-opt while respecting time budgets
- Auto-calculate `numDays`: `ceil(sum(visitDurations + avgTravelTimes) / dailyBudgetHours)`

### Default Visit Durations (when Google Places does not provide)

Google Places API does not return visit duration directly. Use a lookup table by place type:

| Place Category | Default Duration |
|----------------|-----------------|
| museum / art_gallery | 120 min |
| amusement_park / theme_park | 240 min |
| restaurant / food | 60 min |
| tourist_attraction / landmark | 45 min |
| park / natural_feature | 90 min |
| shopping_mall | 90 min |
| cafe | 30 min |
| fallback | 60 min |

User can override per POI in the UI before triggering optimization.

---

## Google Places API Call Patterns

### Input Resolution Pipeline

```
Raw input (text or URL)
         │
         ├── Is it a URL?
         │       │ YES → HTTP HEAD follow redirect → extract lat,lng from expanded URL
         │       │       → Text Search (New) with locationRestriction circle(lat,lng, 100m)
         │       │         fields: id,displayName,formattedAddress,location
         │       │
         │       └── NO → Text Search (New) with textQuery + languageCode:"zh-TW"
         │                 fields: id,displayName,formattedAddress,location
         │                 (Essentials SKU — cheapest)
         │
         └── Return top 1 result per input, show to user for confirmation
```

### Place Details Pipeline

```
PlaceId confirmed by user
         │
         ▼
DB cache check (30-day TTL)
         │
         ├── HIT → return cached JSON
         │
         └── MISS → Places API (New) Place Details
                     Fields: id, displayName, formattedAddress, location,
                             regularOpeningHours, priceLevel, rating, types
                     SKU: Enterprise (triggered by regularOpeningHours)
                     Cache result in places table
```

**Cost note:** The `regularOpeningHours` field triggers the Enterprise SKU (most expensive tier). This is unavoidable for the core feature. Mitigation: cache aggressively (30 days), never re-fetch for the same placeId within TTL.

---

## API Cost Management Strategies

| Strategy | Implementation | Impact |
|----------|---------------|--------|
| **Shared places cache** | `places` DB table shared across all users | One fetch per place across entire user base |
| **30-day TTL** | `updated_at` column + TTL check before API call | Eliminates ~80% repeat calls |
| **Field masking** | Only request needed fields in `X-Goog-FieldMask` header | Prevents accidental Pro/Enterprise tier upcost |
| **Proxy all calls server-side** | Next.js Route Handlers | Key protection + adds server-side cache layer |
| **QPD quota** | Set hard limit in GCP Console | Cost cap as safety net |
| **Budget alerts** | GCP billing alerts at 50/75/90% | Early warning |
| **Text Search for resolution** | Use Text Search (New) fields: id,displayName,location only (Essentials) | Cheapest resolution path |
| **Routes API for matrix** | Single computeRouteMatrix call for N×N instead of N² individual calls | 625 elements per call |
| **Maps JS API key scope** | Restrict to HTTP referrer (your domain) | Prevent key theft |

---

## Data Model

```sql
-- Shared place cache (one row per Google placeId, shared across all users)
CREATE TABLE places (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      TEXT UNIQUE NOT NULL,        -- Google placeId (ChIJ...)
  display_name  TEXT NOT NULL,
  address       TEXT,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  opening_hours JSONB,                       -- regularOpeningHours periods array
  place_types   TEXT[],                      -- Google types array
  price_level   INTEGER,
  rating        NUMERIC(3,1),
  default_visit_duration_minutes INTEGER,    -- derived from types, overridable
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- User itineraries
CREATE TABLE itineraries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  total_days   INTEGER NOT NULL,
  share_token  UUID UNIQUE DEFAULT gen_random_uuid(),  -- for public sharing
  is_public    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- One row per day
CREATE TABLE itinerary_days (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id   UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL,  -- 1-based
  date           DATE,              -- optional, if user picks travel dates
  UNIQUE(itinerary_id, day_number)
);

-- Ordered visits within a day
CREATE TABLE place_visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  place_id         UUID NOT NULL REFERENCES places(id),
  order_index      INTEGER NOT NULL,
  scheduled_start  TIME,            -- e.g., 09:00
  scheduled_end    TIME,            -- e.g., 10:30
  travel_from_prev INTEGER,         -- travel minutes from previous visit
  notes            TEXT,
  visit_duration_override INTEGER,  -- user override of default_visit_duration_minutes
  UNIQUE(itinerary_day_id, order_index)
);

-- RLS policies (Supabase)
-- itineraries: SELECT for owner OR share_token match; INSERT/UPDATE/DELETE for owner only
-- place_visits: inherit from itinerary ownership
-- places: SELECT for all; INSERT/UPDATE for service_role only (server-side)
```

---

## Component Build Order

Dependencies must be built bottom-up. Each layer depends on the one below it.

```
Phase 1: Foundation
  ├── DB schema + RLS policies (Supabase)
  ├── Auth (Supabase Auth: email/password + social)
  └── Basic Next.js app shell

Phase 2: Places Pipeline
  ├── PlacesService: Text Search (New) for input resolution
  ├── PlacesService: Place Details (New) with field masking
  ├── places table caching layer
  └── /api/places/* route handlers
      └── Depends on: Phase 1

Phase 3: Optimizer
  ├── Routes API: computeRouteMatrix for distance matrix
  ├── OptimizerService: nearest neighbor + 2-opt + day-split
  └── /api/optimize route handler
      └── Depends on: Phase 2 (needs place coords + opening hours)

Phase 4: Itinerary UI
  ├── PlaceInput UI: paste + resolve + confirm
  ├── ItineraryView: day cards with time slots
  ├── MapView: Google Maps JS API with per-day colored routes
  └── /api/itineraries CRUD
      └── Depends on: Phase 2 + Phase 3

Phase 5: Persistence + Sharing
  ├── Save/load itineraries
  ├── Share token generation
  ├── Public /share/[token] page (no auth)
  └── Depends on: Phase 4
```

---

## Architecture Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Google API Calls
**What:** Calling Places/Routes API directly from browser JavaScript.
**Why bad:** Exposes secret API key in network tab; no caching possible; CORS issues with some endpoints.
**Instead:** All Google API calls through Next.js Route Handlers. Client only gets the processed result.

### Anti-Pattern 2: On-Demand Optimization (Blocking UX)
**What:** Triggering optimization synchronously in the HTTP request cycle.
**Why bad:** For N=30 POIs, computeRouteMatrix returns up to 900 elements — round trip may take 2-5 seconds.
**Instead:** Show loading state (progress steps: "Resolving places... Fetching details... Optimizing route..."). The operation is fast enough to be synchronous but must give UX feedback.

### Anti-Pattern 3: Re-fetching Place Details Every Optimization
**What:** Calling Place Details API every time user re-runs optimization.
**Why bad:** Enterprise SKU calls × every re-optimization = runaway costs.
**Instead:** Fetch place details once; cache in DB; re-optimization uses cached data. Only re-fetch if cache is stale (>30 days).

### Anti-Pattern 4: Storing Opening Hours as Strings
**What:** `openingHours: "Mon-Fri 09:00-17:00"` as freetext.
**Why bad:** Cannot programmatically check if place is open at a given time; optimizer cannot use it.
**Instead:** Store the full `regularOpeningHours.periods` array as JSONB. Write a utility function `isOpenAt(periods, dayOfWeek, timeMinutes)`.

### Anti-Pattern 5: Exact TSP for N > 15
**What:** Using dynamic programming (Held-Karp) or exhaustive search.
**Why bad:** O(2^N * N²) — for N=20 this is ~400M operations, seconds of compute.
**Instead:** Nearest Neighbor + 2-opt gives 90%+ quality in milliseconds. For N > 25, chain Google Routes API `optimize_waypoints` in segments.

### Anti-Pattern 6: One DirectionsRenderer for All Days
**What:** Concatenating all day routes into a single directions call.
**Why bad:** Cannot color-code by day; loses day boundaries in display.
**Instead:** One DirectionsRenderer instance per day, each with a distinct `strokeColor`.

---

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Places cache hit rate | Low (cold cache) | High (~70-80% for popular cities) | Very high (>90%) | 
| Optimizer compute | Negligible (server-side, <50ms) | Negligible | Consider worker threads |
| DB connections | Supabase default pool fine | Supabase connection pooler (pgBouncer) | Read replicas |
| Maps API costs | Under $200/mo free tier | Monitor Enterprise SKU spend | Negotiate Google Maps contract |
| API key abuse | Domain-restricted key | Rate limit per user IP | Per-user token budget |

---

## Sources

- Google Places API (New) official documentation: field masks, SKU tiers, opening hours fields (MEDIUM confidence — official source)
- Google Routes API: Compute Route Matrix overview — supports 625 elements per request (MEDIUM confidence — official source)
- TSP with Time Windows literature: nearest neighbor + 2-opt is the standard practical heuristic for N<50 (LOW confidence — web synthesis)
- TOPTW (Team Orienteering Problem with Time Windows) as multi-day itinerary frame: PeerJ cs-3350 (MEDIUM confidence — peer-reviewed)
- Next.js Route Handler proxy pattern for API key protection: Next.js official docs + community (MEDIUM confidence — verified pattern)
- Supabase RLS for itinerary sharing: Supabase official docs (MEDIUM confidence — official source)
- Google Maps URL parsing: regex `/@(-?\d+\.\d+),(-?\d+\.\d+)` for expanded URLs; short URLs require redirect resolution (LOW confidence — web)
- @react-google-maps/api for DirectionsService/DirectionsRenderer in Next.js (MEDIUM confidence — official library)
