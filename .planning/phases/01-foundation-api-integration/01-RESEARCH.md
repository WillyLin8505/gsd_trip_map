# Phase 1 Research: Foundation + API Integration

**Phase:** 1 — Foundation + API Integration
**Source:** Synthesized from project-level research (`.planning/research/`)
**Date:** 2026-06-25
**Confidence:** MEDIUM

---

## RESEARCH COMPLETE

---

## Phase 1 Scope Summary

Phase 1 delivers: Next.js 15 project scaffold, Supabase schema + RLS, Google Places API (New) resolution and details endpoints, shared cache layer, cost controls. Everything downstream (optimizer, UI, auth) depends on this foundation being correct and cost-safe.

---

## Implementation Approach

### Project Scaffold

```bash
npx create-next-app@latest . \
  --typescript --tailwind --app --import-alias "@/*"

npm install @supabase/supabase-js @supabase/ssr
npm install drizzle-orm postgres
npm install -D drizzle-kit
npx shadcn@latest init
npm install zod @tanstack/react-query nanoid date-fns
npm install -D @types/google.maps
```

Tailwind v4: no `tailwind.config.ts` needed. shadcn/ui init sets up `components.json` and the CSS variables.

### Database Schema (canonical — from ARCHITECTURE.md)

```sql
-- Shared place cache (cross-user)
CREATE TABLE places (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id                        TEXT UNIQUE NOT NULL,
  display_name                    TEXT NOT NULL,
  address                         TEXT,
  lat                             DOUBLE PRECISION NOT NULL,
  lng                             DOUBLE PRECISION NOT NULL,
  opening_hours                   JSONB,        -- regularOpeningHours.periods[]
  utc_offset_minutes              INTEGER,      -- for timezone-correct scheduling
  place_types                     TEXT[],
  price_level                     INTEGER,
  rating                          NUMERIC(3,1),
  default_visit_duration_minutes  INTEGER,      -- derived from types
  hours_unknown                   BOOLEAN DEFAULT false,
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE itineraries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  total_days   INTEGER NOT NULL,
  city         TEXT,             -- for locationBias + future cross-city clustering
  region       TEXT,
  share_token  UUID UNIQUE DEFAULT gen_random_uuid(),
  is_public    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE itinerary_days (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number    INTEGER NOT NULL,
  date          DATE,
  UNIQUE(itinerary_id, day_number)
);

CREATE TABLE place_visits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id          UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  place_id                  UUID NOT NULL REFERENCES places(id),
  original_query            TEXT,   -- stored for NOT_FOUND re-resolution
  order_index               INTEGER NOT NULL,
  scheduled_start           TIME,
  scheduled_end             TIME,
  travel_from_prev          INTEGER,
  visit_duration_override   INTEGER,
  notes                     TEXT,
  UNIQUE(itinerary_day_id, order_index)
);
```

### RLS Policies

```sql
-- places: anyone can read (shared cache), only service_role can write
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "places_select_all" ON places FOR SELECT USING (true);
CREATE POLICY "places_insert_service" ON places FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "places_update_service" ON places FOR UPDATE USING (auth.role() = 'service_role');

-- itineraries: owner can CRUD; share_token match for SELECT only
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itineraries_owner" ON itineraries USING (auth.uid() = user_id);
CREATE POLICY "itineraries_share_select" ON itineraries FOR SELECT
  USING (is_public = true AND share_token IS NOT NULL);

-- itinerary_days and place_visits: inherit through itinerary ownership
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itinerary_days_owner" ON itinerary_days
  USING (itinerary_id IN (SELECT id FROM itineraries WHERE user_id = auth.uid()));

ALTER TABLE place_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "place_visits_owner" ON place_visits
  USING (itinerary_day_id IN (
    SELECT d.id FROM itinerary_days d
    JOIN itineraries i ON i.id = d.itinerary_id
    WHERE i.user_id = auth.uid()
  ));
```

### Route Handler: POST /api/places/resolve

**Purpose:** Resolve Chinese text names or Google Maps URLs to placeId + confirmation data.

**Request body:**
```json
{
  "inputs": ["台北101", "https://maps.app.goo.gl/..."],
  "city": "台北市",
  "locationBias": { "lat": 25.033, "lng": 121.565, "radiusMeters": 50000 }
}
```

**Resolution pipeline:**
1. For each input — detect if URL (starts with `http`)
2. URL path: `fetch(url, { method: 'HEAD', redirect: 'follow' })` → get final URL → extract `/@lat,lng` with regex `/\/@(-?\d+\.\d+),(-?\d+\.\d+)/` → Text Search (New) with `locationRestriction: { circle: { center: {lat, lng}, radius: 100 } }`
3. Text path: Text Search (New) with `textQuery`, `languageCode: "zh-TW"`, `locationBias` from request
4. Both paths: field mask `id,displayName,formattedAddress,location` (Essentials SKU)
5. Return top 1 result per input: `{ placeId, displayName, formattedAddress, lat, lng }`

**Short URL note (LOW confidence — needs spike):** `maps.app.goo.gl` and `goo.gl/maps/` URLs require redirect following. HEAD request should suffice; implement and test with 3 real short URLs during Phase 1.

### Route Handler: GET /api/places/details

**Purpose:** Return full place details (opening hours, duration, coords) with 30-day cache.

**Query params:** `placeId=ChIJ...`

**Cache-first logic:**
```
SELECT * FROM places WHERE place_id = $1 AND updated_at > NOW() - INTERVAL '30 days'
  HIT → return cached row
  MISS → Places API (New) Place Details:
    URL: places.googleapis.com/v1/places/{placeId}
    Header: X-Goog-FieldMask: id,displayName,formattedAddress,location,regularOpeningHours,utcOffsetMinutes,priceLevel,rating,types
    → Upsert into places table
    → Derive default_visit_duration_minutes from types array (lookup table)
    → Set hours_unknown = true if regularOpeningHours absent
    → Return result
```

**SKU note:** `regularOpeningHours` triggers Enterprise SKU (~$0.017/call). Aggressive caching is the only mitigation.

### Visit Duration Lookup Table (by Google place type)

| Primary type | Default minutes |
|---|---|
| museum, art_gallery | 120 |
| amusement_park, theme_park, aquarium, zoo | 240 |
| restaurant, cafe, food, bakery | 60 |
| tourist_attraction, point_of_interest, landmark | 45 |
| park, national_park, natural_feature, campground | 90 |
| shopping_mall, department_store | 90 |
| cafe, coffee_shop | 30 |
| spa, beauty_salon | 60 |
| fallback (no type match) | 60 |

### Supabase Auth Scaffold

Phase 1 wires up the auth infrastructure (Supabase client, session handling, middleware) without building login UI:
- `@supabase/ssr` createServerClient / createBrowserClient setup
- `middleware.ts` for session refresh on every request
- Server-side helper: `getUser()` for Route Handler auth checks
- Auth is required for all non-public Route Handlers

### Environment Variables

```
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=    # browser, HTTP referrer restricted, Maps JS only
GOOGLE_PLACES_API_KEY=              # server-only, IP restricted, Places + Routes only
```

---

## Critical Pitfalls for Phase 1

### Pitfall 1 — Field masking omission (CRITICAL)
- Set `X-Goog-FieldMask` on EVERY API call. Omitting it defaults to all fields → Enterprise SKU.
- Resolution calls use Essentials fields only (`id,displayName,formattedAddress,location`).
- Details calls use minimum needed fields for optimizer.

### Pitfall 2 — Legacy Places API (CRITICAL)
- Use `places.googleapis.com/v1/places` ONLY. Any `/maps/api/place/` URL is legacy (feature-frozen March 2025).
- Response uses `places[]` array (new) not `results[]` (legacy).

### Pitfall 3 — Opening hours absent ≠ always open (CRITICAL)
- Always check for `regularOpeningHours` presence. If absent: `hours_unknown = true`, do not default to open.
- Store `utcOffsetMinutes` for Phase 2 timezone-correct scheduling.

### Pitfall 6 — Chinese name ambiguity (HIGH)
- Always apply `locationBias` with city bounding box on Text Search. Never search globally.
- Show matched address to user for confirmation before saving.

### Pitfall 12 — No rate limiting (MEDIUM — partial mitigation in Phase 1)
- GCP daily quota cap + billing alerts are Phase 1 deliverables.
- Per-user rate limiting deferred to Phase 5, but quota cap provides a hard ceiling.

---

## Unknowns / Spikes Needed

| Unknown | Confidence | Action |
|---|---|---|
| Google Maps short URL redirect resolution | LOW | Test with 3-5 real `maps.app.goo.gl` URLs in Phase 1 spike |
| Opening hours coverage rate for Taiwanese attractions | UNKNOWN | Test empirically: resolve 20 real Taiwanese places, count `regularOpeningHours` presence |
| `maps.app.goo.gl` HEAD redirect behavior | LOW | Some short URLs may need GET not HEAD |

---

## Sources

See `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` for full sourced research.
