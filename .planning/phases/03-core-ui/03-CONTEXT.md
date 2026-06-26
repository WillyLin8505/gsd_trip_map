# Phase 3: Core UI — Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** Synthesized from project research + 03-RESEARCH.md + 03-UI-SPEC.md + Phase 1/2 artifacts

<domain>
## Phase Boundary

Phase 3 delivers the complete end-to-end anonymous user flow:
- `PlaceInputPanel` — textarea for Chinese names/URLs + city input + "查詢地點" CTA
- `ResolvedPlaceList` — confirmation list with address, remove button
- `OptimizeButton` + `ProgressSteps` — "最佳化行程" CTA with loading states
- `ItineraryView` — day cards (第 N 天) with ordered place rows (arrival/departure/travel/hoursUnknown warning)
- `MapView` — `@vis.gl/react-google-maps`, per-day colored polylines, numbered AdvancedMarkers, InfoWindow on click
- `UnscheduledAlert` — list of places that couldn't be scheduled

**Phase 3 does NOT include:**
- Save itinerary to DB (Phase 4)
- Auth login/register UI (Phase 4)
- Share links (Phase 4)
- Manual visit duration override (Phase 5)
- Rate limiting (Phase 5)

**Phase 3 depends on:**
- Phase 1: `POST /api/places/resolve`, `GET /api/places/details`, `places` DB table
- Phase 2: `POST /api/optimize` → `{suggestedDays, days, unscheduled}`

</domain>

<decisions>
## Implementation Decisions

### Wave 0: Scaffolding (must run before any component work)
- Install missing packages: `npm install @vis.gl/react-google-maps lucide-react next-themes`
- Initialize shadcn: `npx shadcn@latest init` (style: Default, base color: Zinc, CSS variables: yes)
- After init: manually restore `--font-geist-sans` / `--font-geist-mono` tokens in `globals.css` (shadcn init overwrites `@theme inline`)
- Install required shadcn components: `npx shadcn@latest add button input textarea card badge separator scroll-area tabs skeleton alert tooltip`
- Add `QueryProvider` (TanStack Query) wrapper in `src/app/layout.tsx`
- Add `ThemeProvider` (next-themes) in `src/app/layout.tsx`

### Client/Server Boundary
- `app/page.tsx` — server component (renders `PlaceInputPanel` server-side shell)
- `PlaceInputPanel`, `ResolvedPlaceList`, `OptimizeButton`, `ItineraryView`, `DayCard`, `PlaceRow` — all `'use client'` (interactive state)
- `MapView` — `'use client'` + dynamically imported with `ssr: false` via `src/components/map-view-wrapper.tsx` (prevents "window not defined" on SSR)
- `APIProvider` from `@vis.gl/react-google-maps` wraps the Map tree, receives `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Coordinate Gap (CRITICAL)
- `POST /api/optimize` response `ScheduledVisit` contains `placeId` + `displayName` but NO `lat/lng`
- UI must maintain a `resolvedPlaces: Map<string, {lat: number, lng: number, displayName: string}>` from the resolve step
- Pass this map down to `MapView` to join coordinates when building Polyline + AdvancedMarker props
- Pattern: `resolvedPlaces.get(visit.placeId)?.lat` when rendering map

### buildCityBias() Fix (deferred from Phase 1 verifier)
- Current bug: `buildCityBias()` in `src/app/api/places/resolve/route.ts` ignores `city` parameter, always returns Taiwan center (23.6978, 120.9605)
- Fix: add a `CITY_COORDS` lookup table of ~24 Taiwanese cities/counties → `{lat, lng, radiusMeters}`
- Fallback for unrecognized cities: use wider 100km radius around Taiwan center (acceptable for non-Taiwan trips where city name in `textQuery` still disambiguates)
- This fix belongs in Phase 3 since the UI's city input drives the locationBias

### Map Implementation
- `APIProvider` key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (NOT `NEXT_PUBLIC_MAPS_KEY` — align with `.env.local`)
- Per-day polylines: 5-color day palette from UI-SPEC (blue, green, amber, purple, red); cycle for day 6+
- Numbered `AdvancedMarker` per visit: circular badge with visit order number, colored by day
- `InfoWindow` on marker click: `useAdvancedMarkerRef()` hook + `useCallback` on click handler (mandatory — prevents infinite re-render loop per confirmed GitHub issue #404)
- MapView wrapper: `src/components/map-view-wrapper.tsx` uses `dynamic(() => import('./map-view'), { ssr: false })`

### State Management
- Plain `useState + fetch` for Phase 3 (both resolve + optimize are mutations/one-shot calls, not queries to cache)
- TanStack Query deferred to Phase 4 (itinerary persistence)
- State shape in `page.tsx` or top-level client component:
  - `rawInputs: string` (textarea value)
  - `city: string`
  - `resolvedPlaces: ResolvedPlace[]` (after resolve)
  - `optimizeResult: OptimizeResult | null` (after optimize)
  - `loading: 'idle' | 'resolving' | 'optimizing'`
  - `error: string | null`

### Mobile Layout (DISP-04)
- Single-column stack on mobile (`flex-col`): PlaceInputPanel → ResolvedPlaceList → ItineraryView → MapView (400px fixed height)
- Side-by-side on desktop (`md:flex-row`): ItineraryView (left, scrollable) | MapView (right, `min-h-[600px]`)
- 375px viewport: no horizontal scroll; all elements `w-full max-w-full`
- Touch targets: minimum `h-11` (44px) on all interactive elements

### hoursUnknown Warning (UI contract)
- Place rows with `hoursUnknown: true`: amber badge `⚠ 營業時間未知`
- Map InfoWindow for hoursUnknown places: amber warning text "建議出發前確認"
- Badge uses: `bg-amber-50 text-amber-700 border border-amber-200`

### env var naming
- Browser key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (matches `.env.local` and Phase 1 skeleton — NOT `NEXT_PUBLIC_MAPS_KEY`)

### Existing Phase 1 Component
- `src/components/place-resolver-form.tsx` exists but is a minimal prototype; Phase 3 replaces/extends it with the full `PlaceInputPanel` component

### Anonymous Flow (AUTH-01)
- No auth checks on any Phase 3 Route Handler calls
- No login prompts, no gating
- `page.tsx` serves the full UI to unauthenticated users

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Contract
- `.planning/phases/03-core-ui/03-UI-SPEC.md` — ALL design decisions: colors (60/30/10), typography (4 sizes), spacing (8pt scale), copywriting (zh-TW CTAs/errors/empty states), component list, shadcn init instructions

### Technical Research
- `.planning/phases/03-core-ui/03-RESEARCH.md` — @vis.gl/react-google-maps patterns, SSR dynamic import, `useCallback` infinite-loop fix, coordinate gap pattern, buildCityBias fix, globals.css restore after shadcn init

### Phase 1/2 API Contracts
- `.planning/phases/01-foundation-api-integration/01-01-SUMMARY.md` — resolve route, places-client patterns
- `.planning/phases/02-optimization-engine/02-03-SUMMARY.md` — POST /api/optimize request/response shape

### Existing Code to Read
- `src/app/page.tsx` — current entry point (will be replaced)
- `src/components/place-resolver-form.tsx` — Phase 1 prototype (will be replaced by PlaceInputPanel)
- `src/app/api/places/resolve/route.ts` — buildCityBias bug location
- `src/app/layout.tsx` — add QueryProvider + ThemeProvider here
- `src/lib/optimizer/types.ts` — OptimizeResult, ScheduledVisit types (read for coordinate gap awareness)

</canonical_refs>

<specifics>
## Specific Constraints

- **Coordinate gap is the #1 integration risk** — `POST /api/optimize` returns no lat/lng. UI must carry `resolvedPlaces` Map through the full flow and join at MapView render time.
- **`ssr: false` on MapView is mandatory** — omitting it causes "window not defined" SSR crash. Use `dynamic()` wrapper.
- **`useCallback` on AdvancedMarker click handlers is mandatory** — omitting it triggers an infinite re-render loop (confirmed @vis.gl/react-google-maps #404).
- **globals.css restoration** — shadcn init will overwrite `@theme inline` block. Restore `--font-geist-sans` and `--font-geist-mono` tokens before any styling work.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`** — this exact env var name. Not `NEXT_PUBLIC_MAPS_KEY`.
- **hoursUnknown warning must appear in BOTH** the itinerary table row AND the map InfoWindow tooltip.
- **Unscheduled places must be displayed** — use `UnscheduledAlert` component; never silently hide them.

</specifics>

<deferred>
## Deferred to Later Phases

- Save/load itinerary (POST /api/itineraries) — Phase 4
- Auth login/register UI — Phase 4
- Share link page — Phase 4
- TanStack Query for caching — Phase 4
- Manual visit duration override UI — Phase 5
- Rate limiting / API call budget display — Phase 5
- Drag-and-drop reorder — Phase 5

</deferred>

---

*Phase: 03-core-ui*
*Context gathered: 2026-06-26 via project research synthesis + UI-SPEC + Phase 3 research*
