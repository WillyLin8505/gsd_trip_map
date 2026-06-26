# Phase 3: Core UI — Research

**Researched:** 2026-06-26
**Domain:** Next.js 15 App Router UI, @vis.gl/react-google-maps, shadcn/ui + Tailwind v4, TanStack Query v5
**Confidence:** MEDIUM

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISP-01 | Day-by-day itinerary table with place names and time intervals | DayCard + PlaceRow component patterns; ScheduledVisit type from schedule.ts |
| DISP-02 | Each place shows opening hours and ticket info from Places API | PlaceRow renders hoursUnknown badge + priceLevel; data comes from /api/optimize response |
| DISP-03 | Interactive map: per-day colored polylines and numbered markers | @vis.gl/react-google-maps Polyline + AdvancedMarker patterns; DAY_COLORS palette from UI-SPEC |
| DISP-04 | Mobile-responsive at 375px, no horizontal scroll | Tailwind v4 flex + md: breakpoint; Tabs for mobile map/itinerary toggle |
| AUTH-01 | Anonymous users can use full planning flow | No auth gate; PlaceInputPanel calls Route Handlers directly without Supabase session |
</phase_requirements>

---

## Summary

Phase 3 builds the full end-to-end anonymous user flow on top of the two working Route Handlers: `POST /api/places/resolve` (Phase 1) and `POST /api/optimize` (Phase 2). The UI layer consists entirely of React client components calling these handlers — no new backend work is needed except the `buildCityBias()` fix.

The core technical challenges are: (1) correctly integrating `@vis.gl/react-google-maps` within Next.js 15 App Router's client boundary model, (2) initializing `shadcn/ui` against an existing Tailwind v4 project, and (3) fixing `buildCityBias()` to produce city-specific coordinates rather than a static Taiwan center.

**Primary recommendation:** Replace `PlaceResolverForm` with the multi-component architecture defined in the UI-SPEC (`PlaceInputPanel` → `ResolvedPlaceList` → `ItineraryView` + `MapView`). The `MapView` component must be a `'use client'` component that is dynamically imported with `ssr: false` from a server component wrapper to avoid hydration mismatches. All other Phase 3 components are also `'use client'` due to interactive state.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Place input / resolve | Client (Browser) | API / Backend | User interaction + fetch to server Route Handler |
| Place confirmation list | Client (Browser) | — | Local state only (remove action, no API call) |
| Optimize trigger | Client (Browser) | API / Backend | POST to /api/optimize Route Handler |
| Day-by-day itinerary display | Client (Browser) | — | Renders OptimizeResult received from /api/optimize |
| Interactive map rendering | Client (Browser) | CDN / Static | Maps JS API loaded client-side only; NEXT_PUBLIC key |
| Opening hours / place details | API / Backend | Database / Storage | Places API + DB cache already in /api/places/details |
| Route optimization | API / Backend | — | Existing POST /api/optimize (Phase 2); no UI-layer changes |
| Anonymous flow gate | Client (Browser) | — | No auth check; page renders without session |
| buildCityBias() fix | API / Backend | — | Server-side in places-client.ts; lookup table replaces hardcoded center |

---

## Standard Stack

### Core (all already in package.json)
| Library | Installed Version | Purpose | Status |
|---------|------------------|---------|--------|
| next | 16.2.9 | App Router, dynamic import, layout | Already installed |
| react | 19.2.4 | UI rendering | Already installed |
| @tanstack/react-query | ^5.101.1 | Client-side state caching for place/optimize results | Already installed |
| tailwindcss | ^4 | Zero-config styling | Already installed |
| zod | ^4.4.3 | Schema validation (already used in Route Handlers) | Already installed |

### Phase 3 New Installs Required
| Library | Registry Version | Purpose | Verdict |
|---------|-----------------|---------|---------|
| @vis.gl/react-google-maps | 1.21.0 [VERIFIED: npm registry] | Google Maps React wrapper | OK — install |
| lucide-react | 0.4.6 [VERIFIED: npm registry] | Icon set for shadcn/ui | SUS (too-new package date); 84M/wk downloads, official repo — safe to use, flag for awareness |
| next-themes | 1.8.3 [VERIFIED: npm registry] | Dark mode (installed but not used in Phase 3) | OK — install for Phase 4 readiness |
| shadcn | 4.11.0 [VERIFIED: npm registry] | CLI for component scaffolding (dev tool) | OK — npx only, no direct install |

**Installation commands:**
```bash
npm install @vis.gl/react-google-maps lucide-react next-themes
npx shadcn@latest init
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @vis.gl/react-google-maps | npm | Published 2026-04-09 | ~1.96M/wk | github.com/visgl/react-google-maps | OK | Approved |
| lucide-react | npm | Published 2026-06-18 | ~84M/wk | github.com/lucide-icons/lucide | SUS (too-new) | Flagged — planner must add checkpoint:human-verify. High downloads + official org repo; risk is low in practice. |
| next-themes | npm | Published 2025-03-11 | ~24M/wk | github.com/pacocoursey/next-themes | OK | Approved |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** `lucide-react` — flagged as too-new by legitimacy checker. However, 84M weekly downloads and official lucide-icons org confirm it is the legitimate package. Planner should add a `checkpoint:human-verify` task before install, but this is low-risk.

---

## Architecture Patterns

### System Architecture Diagram

```
User Browser
    │
    ├─ PlaceInputPanel ('use client')
    │     ├─ Step 1: textarea + city input → POST /api/places/resolve
    │     ├─ Step 2: ResolvedPlaceList (local state, remove button)
    │     └─ Step 3: "最佳化行程" → POST /api/optimize
    │
    ├─ ProgressSteps ('use client') — 3-step indicator
    │
    └─ ResultsLayout ('use client') — conditionally shown after optimize
          │
          ├─ Mobile: <Tabs> with "行程表" / "地圖"
          └─ Desktop: flex-row split
                ├─ ItineraryView ('use client')
                │     └─ DayCard[] → PlaceRow[]
                │
                └─ MapViewWrapper (Server Component)
                      └─ dynamic(() => import('./map-view'), { ssr: false })
                            └─ MapView ('use client')
                                  ├─ <APIProvider apiKey={NEXT_PUBLIC_MAPS_KEY}>
                                  ├─ <Map>
                                  │     ├─ <Polyline> per day (per DAY_COLORS)
                                  │     └─ <AdvancedMarker> per visit
                                  └─ <DayLegend>
```

### Recommended Project Structure

```
src/
├── app/
│   ├── page.tsx                     # Server component — renders PlaceInputPanel
│   ├── layout.tsx                   # Add QueryProvider wrapper here
│   └── api/                         # Existing (no changes in Phase 3)
│       ├── places/resolve/route.ts
│       ├── places/details/route.ts
│       └── optimize/route.ts
├── components/
│   ├── place-resolver-form.tsx      # REPLACED by place-input-panel.tsx
│   ├── place-input-panel.tsx        # 'use client' — 3-step flow controller
│   ├── resolved-place-list.tsx      # 'use client' — confirmation list
│   ├── itinerary-view.tsx           # 'use client' — day-by-day table
│   ├── day-card.tsx                 # 'use client' — single day accordion
│   ├── place-row.tsx                # 'use client' — single visit row
│   ├── map-view-wrapper.tsx         # Server component — dynamic import gate
│   ├── map-view.tsx                 # 'use client' — Google Maps component
│   ├── day-legend.tsx               # inline in map-view.tsx
│   ├── unscheduled-alert.tsx        # 'use client' — shows unscheduled places
│   └── progress-steps.tsx          # 'use client' — 3-step indicator
├── providers/
│   └── query-provider.tsx           # 'use client' — QueryClientProvider wrapper
├── lib/
│   ├── google/
│   │   ├── places-client.ts         # FIX: buildCityBias() → city lookup table
│   │   └── routes-client.ts
│   ├── optimizer/
│   ├── db/
│   └── validation/
└── types/
    └── itinerary.ts                 # Client-side OptimizeResult type re-export
```

### Pattern 1: @vis.gl/react-google-maps — MapView Client Component

**What:** Wrap all map components in `'use client'`; never render in SSR.
**When to use:** Whenever Google Maps JS API components appear.

```typescript
// Source: visgl.github.io/react-google-maps/docs/get-started
'use client';

import {
  APIProvider,
  Map,
  AdvancedMarker,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
  InfoWindow,
} from '@vis.gl/react-google-maps';
import { Polyline } from '@vis.gl/react-google-maps';
import { useEffect, useState, useCallback } from 'react';

const DAY_COLORS = ['#2563EB', '#16A34A', '#D97706', '#9333EA', '#DC2626'];

interface VisitCoord {
  lat: number;
  lng: number;
  displayName: string;
  scheduledStart: string;
  scheduledEnd: string;
  hoursUnknown: boolean;
  dayIndex: number;
  visitIndex: number;
}

export function MapView({ days }: { days: Array<{ dayNumber: number; visits: VisitCoord[] }> }) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  // Fit all markers into view on first load
  useEffect(() => {
    if (!map || !coreLib) return;
    const allCoords = days.flatMap(d => d.visits);
    if (allCoords.length === 0) return;
    const bounds = new coreLib.LatLngBounds();
    allCoords.forEach(c => bounds.extend({ lat: c.lat, lng: c.lng }));
    map.fitBounds(bounds, 60); // 60px padding
  }, [map, coreLib, days]);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <Map
        style={{ width: '100%', height: '100%' }}
        defaultCenter={{ lat: 23.6978, lng: 120.9605 }}
        defaultZoom={10}
        gestureHandling="greedy"
        mapId="itinerary-map"
      >
        {days.map((day, dayIndex) => {
          const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
          const path = day.visits.map(v => ({ lat: v.lat, lng: v.lng }));
          return (
            <Polyline
              key={`polyline-${dayIndex}`}
              path={path}
              strokeColor={color}
              strokeWeight={4}
              strokeOpacity={0.85}
            />
          );
        })}
        {days.flatMap((day, dayIndex) =>
          day.visits.map((visit, visitIdx) => (
            <MarkerWithInfoWindow
              key={`${dayIndex}-${visitIdx}`}
              visit={visit}
              dayIndex={dayIndex}
              visitIndex={visitIdx + 1}
              color={DAY_COLORS[dayIndex % DAY_COLORS.length]}
            />
          ))
        )}
      </Map>
    </APIProvider>
  );
}
```

**Note:** `APIProvider` must be INSIDE the `'use client'` component — the apiKey prop must be available on first render. `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is accessible in browser context because of the `NEXT_PUBLIC_` prefix. [VERIFIED: visgl.github.io/react-google-maps/docs/api-reference/components/api-provider]

### Pattern 2: AdvancedMarker with Custom HTML and InfoWindow

**What:** Numbered circular markers in day-color with click-to-show InfoWindow.
**When to use:** Per-visit markers on the itinerary map.

```typescript
// Source: visgl.github.io/react-google-maps/docs/api-reference/components/advanced-marker
'use client';
import { AdvancedMarker, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { useCallback, useState } from 'react';

function MarkerWithInfoWindow({
  visit, dayIndex, visitIndex, color
}: {
  visit: VisitCoord;
  dayIndex: number;
  visitIndex: number;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  // CRITICAL: memoize onClick to prevent infinite re-render loop
  // See: github.com/visgl/react-google-maps/discussions/404
  const handleClick = useCallback(() => setOpen(o => !o), []);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: visit.lat, lng: visit.lng }}
        onClick={handleClick}
        aria-label={`${visit.displayName} — 第${dayIndex + 1}天 第${visitIndex}站`}
      >
        {/* Custom circular marker */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: color,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
            border: '2px solid white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
        >
          {visitIndex}
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onClose={() => setOpen(false)}>
          <div style={{ minWidth: 140 }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px' }}>{visit.displayName}</p>
            <p style={{ margin: '0 0 2px', fontSize: 13 }}>
              {visit.scheduledStart} – {visit.scheduledEnd}
            </p>
            {visit.hoursUnknown && (
              <p style={{ color: '#b45309', fontSize: 12, margin: 0 }}>
                營業時間未知，建議出發前確認
              </p>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}
```

**Critical pitfall:** Do NOT assign an un-memoized ref callback to `ref={markerRef}` and then mutate state in the same render — this triggers an infinite loop (github.com/visgl/react-google-maps/discussions/404). Always use `useCallback` for click handlers. [CITED: github.com/visgl/react-google-maps/discussions/404]

### Pattern 3: MapView Dynamic Import (SSR Prevention)

**What:** Import MapView with `ssr: false` to prevent window-not-defined errors.
**When to use:** The parent component is a server component or needs to avoid hydration.

```typescript
// src/components/map-view-wrapper.tsx
// No 'use client' — this is a Server Component that gates the dynamic import
import dynamic from 'next/dynamic';

const MapView = dynamic(
  () => import('./map-view').then(m => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 text-sm">地圖載入中...</p>
      </div>
    ),
  }
);

export { MapView };
```

**Note:** `ssr: false` is only valid when used from a Server Component or inside a `'use client'` component. [CITED: nextjs.org/docs/app/guides/lazy-loading]

### Pattern 4: TanStack Query v5 Provider Setup

**What:** Single `QueryClientProvider` wrapper in layout.tsx.
**When to use:** All React Query hooks need this ancestor provider.

```typescript
// src/providers/query-provider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Browser singleton — one stable client per browser tab
// Do NOT use useState here; the module-level const is already stable
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 60s prevents immediate refetch on hydration
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

```typescript
// src/app/layout.tsx (modify existing)
import { QueryProvider } from '@/providers/query-provider';

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant" ...>
      <body ...>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
```

[CITED: tanstack.com/query/v5/docs/framework/react/guides/ssr]

### Pattern 5: shadcn/ui Initialization with Tailwind v4

**What:** Running `npx shadcn@latest init` on an existing Tailwind v4 project.
**When to use:** First time setting up shadcn in this project (components.json does not exist).

```bash
# Step 1: Install dependencies first
npm install @vis.gl/react-google-maps lucide-react next-themes

# Step 2: Initialize shadcn — CLI auto-detects Tailwind v4
npx shadcn@latest init
# Prompts:
#   Style: Default
#   Base color: Zinc (matches existing gray-* in place-resolver-form.tsx)
#   CSS variables: yes (required for theming)
```

After init, `components.json` is created. The CLI will update `globals.css` to add shadcn's CSS variables under `@theme inline`. Verify it does not conflict with existing `--color-background` and `--color-foreground` variables in globals.css.

**Expected globals.css shape after init (Tailwind v4 pattern):** [CITED: ui.shadcn.com/docs/tailwind-v4]

```css
@import "tailwindcss";

/* shadcn/ui adds these after init: */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(0 0% 3.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(0 0% 3.9%);
  --primary: hsl(0 0% 9%);
  --primary-foreground: hsl(0 0% 98%);
  /* ... more tokens ... */
}

.dark {
  --background: hsl(0 0% 3.9%);
  /* ... dark variants ... */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  /* ... */
}
```

**Conflict with existing globals.css:** The existing file uses `var(--background)` as a raw hex string (`#ffffff`). shadcn's init wraps values in `hsl()`. The executor must merge these carefully — the existing `--font-sans` and `--font-mono` in `@theme inline` must be preserved. The safest approach: let shadcn init rewrite globals.css, then re-add the font variables manually.

**Individual component install:**
```bash
npx shadcn@latest add button input textarea card badge separator scroll-area skeleton alert tooltip tabs
```

### Pattern 6: buildCityBias() Fix — City Lookup Table

**What:** Replace the hardcoded Taiwan center with a city-name → coordinates lookup.
**Bug location:** `src/lib/google/places-client.ts` lines 140–152 (`buildCityBias()` function).
**Why it's a bug:** `buildCityBias()` always returns center of Taiwan (23.6978, 120.9605) regardless of city input. When a user searches for places in Kaohsiung (22.63°N, 120.27°E), the 50km radius circle centered on 23.69°N still covers the right area — but for cities like Keelung (25.13°N, 121.74°E) or Taitung (22.75°N, 121.15°E) the coverage drifts or misses.

**Fix: predefined city lookup table (no geocoding API needed for Phase 3):**

```typescript
// src/lib/google/places-client.ts — replace buildCityBias()

/** Coordinates for common Taiwanese cities. All data [ASSUMED] from public lat/lng sources. */
const TAIWAN_CITY_COORDS: Record<string, { lat: number; lng: number; radius: number }> = {
  // Special Municipalities
  '台北': { lat: 25.0330, lng: 121.5654, radius: 20000 },
  '台北市': { lat: 25.0330, lng: 121.5654, radius: 20000 },
  '新北': { lat: 25.0129, lng: 121.4651, radius: 30000 },
  '新北市': { lat: 25.0129, lng: 121.4651, radius: 30000 },
  '桃園': { lat: 24.9936, lng: 121.3010, radius: 25000 },
  '桃園市': { lat: 24.9936, lng: 121.3010, radius: 25000 },
  '台中': { lat: 24.1477, lng: 120.6736, radius: 25000 },
  '台中市': { lat: 24.1477, lng: 120.6736, radius: 25000 },
  '台南': { lat: 22.9999, lng: 120.2270, radius: 25000 },
  '台南市': { lat: 22.9999, lng: 120.2270, radius: 25000 },
  '高雄': { lat: 22.6273, lng: 120.3014, radius: 25000 },
  '高雄市': { lat: 22.6273, lng: 120.3014, radius: 25000 },
  // Counties
  '基隆': { lat: 25.1276, lng: 121.7392, radius: 15000 },
  '基隆市': { lat: 25.1276, lng: 121.7392, radius: 15000 },
  '新竹': { lat: 24.8039, lng: 120.9647, radius: 20000 },
  '新竹市': { lat: 24.8039, lng: 120.9647, radius: 20000 },
  '嘉義': { lat: 23.4801, lng: 120.4491, radius: 20000 },
  '嘉義市': { lat: 23.4801, lng: 120.4491, radius: 20000 },
  '宜蘭': { lat: 24.7021, lng: 121.7378, radius: 25000 },
  '宜蘭縣': { lat: 24.7021, lng: 121.7378, radius: 25000 },
  '花蓮': { lat: 23.9910, lng: 121.6015, radius: 25000 },
  '花蓮縣': { lat: 23.9910, lng: 121.6015, radius: 25000 },
  '台東': { lat: 22.7583, lng: 121.1444, radius: 25000 },
  '台東縣': { lat: 22.7583, lng: 121.1444, radius: 25000 },
  '澎湖': { lat: 23.5711, lng: 119.5793, radius: 20000 },
  '金門': { lat: 24.4493, lng: 118.3765, radius: 15000 },
};

function buildCityBias(city: string): LocationBias {
  // Normalize: trim whitespace, try direct lookup, then try prefix match
  const normalized = city.trim();
  const lookup =
    TAIWAN_CITY_COORDS[normalized] ??
    TAIWAN_CITY_COORDS[normalized.slice(0, 2)] ??  // "台北市" → try "台北"
    null;

  if (lookup) {
    return {
      circle: {
        center: { latitude: lookup.lat, longitude: lookup.lng },
        radius: lookup.radius,
      },
    };
  }

  // Fallback for unknown cities: broad Taiwan-center circle
  // This preserves existing behavior for non-Taiwan cities (e.g., "京都市")
  return {
    circle: {
      center: { latitude: 23.6978, longitude: 120.9605 },
      radius: 100000, // wider fallback — city name in textQuery still guides resolution
    },
  };
}
```

**Coordinates confidence:** [ASSUMED] — derived from public lat/lng databases and training knowledge, not verified against a definitive authoritative source in this session. The planner should add a checkpoint for the executor to verify key city coordinates before committing.

### Pattern 7: Mobile Responsive Layout — Tailwind v4

**What:** Stacked on mobile, side-by-side on desktop. Tabs on mobile for map/itinerary.
**Breakpoint:** `md:` = 768px (Tailwind default, unchanged in v4).

```tsx
// ResultsLayout — mobile: stacked with Tabs; desktop: flex-row split
// Source: 03-UI-SPEC.md section 6

// Mobile (default): Tabs component
// Desktop (md+): flex row
export function ResultsLayout({ itinerary }: { itinerary: OptimizeResult }) {
  return (
    <>
      {/* Mobile: Tabs */}
      <div className="md:hidden">
        <Tabs defaultValue="itinerary">
          <TabsList className="w-full">
            <TabsTrigger value="itinerary" className="flex-1 h-11">行程表</TabsTrigger>
            <TabsTrigger value="map" className="flex-1 h-11">地圖</TabsTrigger>
          </TabsList>
          <TabsContent value="itinerary">
            <ItineraryView itinerary={itinerary} />
          </TabsContent>
          <TabsContent value="map">
            <div className="h-[calc(100vh-200px)]">
              <MapView days={itinerary.days} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: side-by-side */}
      <div className="hidden md:flex gap-6 items-start">
        <div className="w-[420px] flex-shrink-0">
          <ScrollArea className="h-[calc(100vh-160px)]">
            <ItineraryView itinerary={itinerary} />
          </ScrollArea>
        </div>
        <div className="flex-1 sticky top-4 h-[calc(100vh-160px)]">
          <MapView days={itinerary.days} />
        </div>
      </div>
    </>
  );
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible UI components (Button, Card, Badge, Tabs, etc.) | Custom HTML + manual ARIA | shadcn/ui + Radix primitives | Keyboard nav, focus management, ARIA roles already correct |
| Icon SVGs | Inline SVG / PNG | Lucide React | Tree-shakeable, consistent stroke width, named exports |
| Map markers with custom HTML | canvas / raw DOM | AdvancedMarker children prop (portal) | Library manages lifecycle, z-index, and event handlers |
| Multiple map instances | Create multiple APIProvider | Single APIProvider, multiple Map with id prop | Maps JS API loads once; multiple providers are a no-op after first |
| Client-side state caching | useState + useEffect fetch chains | TanStack Query useMutation + useQuery | Handles loading/error/success states, automatic deduplication |
| Dark mode toggle | prefers-color-scheme media query + manual class toggle | next-themes ThemeProvider | Handles SSR flicker, localStorage persistence, class injection |

---

## Common Pitfalls

### Pitfall 1: AdvancedMarker Infinite Re-render Loop
**What goes wrong:** `useAdvancedMarkerRef()` returns a ref-callback; if an un-memoized callback is used and mutates state, React triggers infinite re-renders.
**Why it happens:** The ref-callback changes identity each render, causing the marker to re-mount, which fires the callback again.
**How to avoid:** Always wrap click handlers with `useCallback`. Never set state in a bare (non-memoized) callback passed to an AdvancedMarker.
**Warning signs:** React "Maximum update depth exceeded" error in console; browser tab locks up.

### Pitfall 2: MapView Hydration Mismatch (window not defined)
**What goes wrong:** `@vis.gl/react-google-maps` accesses `window.google` on import; if server-rendered, Next.js throws "window is not defined".
**Why it happens:** App Router server components run in Node.js where `window` is absent; Maps JS API requires browser globals.
**How to avoid:** Always wrap MapView in `dynamic(() => import('./map-view'), { ssr: false })` inside a server component wrapper. Never directly import MapView in a server component.
**Warning signs:** Build-time error "window is not defined"; hydration mismatch warnings in dev console.

### Pitfall 3: APIProvider Props Instability
**What goes wrong:** Passing a different `apiKey` object reference on re-renders causes the Maps JS API to try to re-initialize, which it ignores (loads once) but logs warnings.
**Why it happens:** `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is a string constant — this is not a problem. The issue arises if apiKey is constructed dynamically.
**How to avoid:** Pass the env var directly: `apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}`. Do not construct it in a closure or state variable.

### Pitfall 4: shadcn init Overwriting globals.css Font Variables
**What goes wrong:** `npx shadcn@latest init` rewrites `globals.css` and removes the existing `--font-sans: var(--font-geist-sans)` and `--font-mono: var(--font-geist-mono)` lines from `@theme inline`.
**Why it happens:** shadcn init rewrites the `@theme inline` block entirely.
**How to avoid:** After running `shadcn init`, manually re-add the font variable lines to `@theme inline`:
```css
@theme inline {
  /* ... shadcn vars ... */
  --font-sans: var(--font-geist-sans);   /* preserve from Phase 1 */
  --font-mono: var(--font-geist-mono);   /* preserve from Phase 1 */
}
```
**Warning signs:** body font reverts to system sans-serif; Geist font not loading.

### Pitfall 5: QueryClient Created Outside Provider (browser singleton lost on HMR)
**What goes wrong:** During Next.js HMR in dev mode, module-level QueryClient is recreated, losing cache.
**Why it happens:** HMR reloads the module, resetting the module-level singleton.
**How to avoid:** Acceptable in development (cache loss is expected). In production this is not an issue. If cache persistence is critical during development, wrap in `useState(() => new QueryClient())` inside the provider — but the module-level pattern is standard for Phase 3.

### Pitfall 6: Polyline Path Type Mismatch
**What goes wrong:** Passing `{ latitude, longitude }` objects (Google Places API format) instead of `{ lat, lng }` objects (Maps JS API format) to Polyline `path` prop.
**Why it happens:** The Places API uses `location.latitude` / `location.longitude`; the Maps JS API uses `lat` / `lng`.
**How to avoid:** When building the `path` array for Polyline, always map to `{ lat: visit.lat, lng: visit.lng }`. The `ScheduledVisit` type does not include coordinates — the UI must join back to the resolved places list to get lat/lng for each visit by `placeId`.

### Pitfall 7: PlaceRow lat/lng Missing from OptimizeResult
**What goes wrong:** `POST /api/optimize` returns `ScheduledVisit[]` which has `placeId`, `displayName`, `scheduledStart`, `scheduledEnd`, `travelFromPrevMinutes`, `hoursUnknown` — but NOT `lat`/`lng` coordinates.
**Why it happens:** The optimize response contract (Phase 2) does not include coordinates in the output to keep the response lean.
**How to avoid:** The UI must maintain a `Map<placeId, { lat, lng }>` lookup from the resolve step. Pass both the optimize result AND the resolved places list to MapView. Build the coordinate lookup before rendering polylines and markers.

---

## Code Examples

### POST /api/optimize request from UI

```typescript
// Source: src/app/api/optimize/route.ts + src/lib/validation/optimize.ts (Phase 2)
const response = await fetch('/api/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    placeIds: resolvedPlaces.map(p => p.placeId), // string[]
    numDays: undefined,   // let optimizer auto-calculate
    travelDate: undefined, // defaults to next Monday
  }),
});

// Response shape (OptimizeResult from schedule.ts):
// {
//   suggestedDays: number,
//   days: Array<{
//     dayNumber: number,
//     visits: Array<{
//       placeId: string,
//       displayName: string,
//       scheduledStart: "HH:MM",
//       scheduledEnd: "HH:MM",
//       travelFromPrevMinutes: number,
//       waitMinutes: number,
//       hoursUnknown: boolean,
//       warning?: string,
//     }>
//   }>,
//   unscheduled: Array<{ placeId: string, reason: string }>
// }
```

### Day Color Palette (DISP-03)

```typescript
// Source: 03-UI-SPEC.md section 4
export const DAY_COLORS = [
  '#2563EB', // blue-600  — Day 1
  '#16A34A', // green-600 — Day 2
  '#D97706', // amber-600 — Day 3
  '#9333EA', // purple-600 — Day 4
  '#DC2626', // red-600   — Day 5
] as const;

export function getDayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
}
```

### hoursUnknown Warning Badge

```tsx
// Source: 03-UI-SPEC.md section 7 Flow D
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function HoursUnknownBadge() {
  return (
    <Badge
      className="bg-amber-50 text-amber-700 border-amber-200 gap-1"
      variant="outline"
    >
      <Clock className="h-3 w-3" />
      營業時間未知，建議出發前確認
    </Badge>
  );
}
```

### Handling Coordinate Lookup for MapView

```typescript
// The UI needs to maintain a placeId → coordinates map from the resolve step
// because OptimizeResult does NOT contain lat/lng (see Pitfall 7)

type PlaceCoordMap = Map<string, { lat: number; lng: number }>;

// Build during resolve step:
const coordMap: PlaceCoordMap = new Map(
  resolvedPlaces.map(p => [p.placeId, { lat: p.lat, lng: p.lng }])
);

// Use when building MapView props:
const daysWithCoords = optimizeResult.days.map(day => ({
  dayNumber: day.dayNumber,
  visits: day.visits.map(visit => ({
    ...visit,
    lat: coordMap.get(visit.placeId)?.lat ?? 0,
    lng: coordMap.get(visit.placeId)?.lng ?? 0,
  })),
}));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@googlemaps/react-wrapper` | `@vis.gl/react-google-maps` | 2023 (archived) | Official Google Maps React library; AdvancedMarker replaces Marker |
| `@react-google-maps/api` | `@vis.gl/react-google-maps` | 2023 | vis.gl is the Google-endorsed replacement |
| Directions API | Routes API | March 2025 | Directions API is now Legacy; Routes API is the current standard (already used in Phase 2) |
| tailwind.config.ts | No config file (v4 zero-config) | Tailwind v4 release | `@theme inline` in globals.css replaces config file |
| shadcn HSL CSS vars | shadcn OKLCH CSS vars | shadcn v4 update | OKLCH is more perceptually uniform; CLI handles conversion |
| `auth-helpers-nextjs` | `@supabase/ssr` | 2024 | auth-helpers deprecated; already using @supabase/ssr in Phase 1 |

**Deprecated/outdated:**
- `@googlemaps/react-wrapper`: Archived on GitHub. Do not use.
- `@react-google-maps/api` DirectionsService + DirectionsRenderer: Works but not the Google-endorsed approach. Use vis.gl Polyline instead.
- `toast` component from shadcn: Deprecated in favor of `sonner`. Not needed in Phase 3.
- `tailwindcss-animate`: Deprecated in favor of `tw-animate-css` for Tailwind v4. shadcn init handles this automatically.

---

## Runtime State Inventory

Not applicable — Phase 3 is a greenfield UI layer with no renames, refactors, or migrations. No existing runtime state is affected.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | ✓ | (WSL2 dev env) | — |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | MapView APIProvider | configured (env.local) | — | Map shows placeholder div with "地圖暫時無法顯示" |
| GOOGLE_PLACES_API_KEY | /api/places/resolve, /api/optimize | configured (env.local) | — | 500 from Route Handlers |
| DATABASE_URL / Supabase | /api/places/resolve upsert | configured | — | 500 from Route Handler |
| @vis.gl/react-google-maps | MapView | NOT INSTALLED | 1.21.0 | — (must install) |
| lucide-react | shadcn/ui icons | NOT INSTALLED | 0.4.6 | — (must install) |
| next-themes | Dark mode (Phase 4) | NOT INSTALLED | 1.8.3 | — (install for Phase 4 readiness) |
| shadcn/ui (components.json) | All UI components | NOT INITIALIZED | shadcn 4.11.0 | — (must run `npx shadcn@latest init`) |

**Missing dependencies with no fallback:**
- `@vis.gl/react-google-maps` — blocks MapView implementation
- `lucide-react` — blocks icon usage in shadcn components
- shadcn initialization — blocks all shadcn component add commands

**Missing dependencies with fallback:**
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` not set → gray placeholder shown instead of map (per UI-SPEC)

---

## Validation Architecture

nyquist_validation is enabled (not explicitly false in config.json).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | ItineraryView renders day cards with place names and time slots | unit | `npx vitest run src/components/itinerary-view.test.tsx` | ❌ Wave 0 |
| DISP-02 | PlaceRow shows openingHours and hoursUnknown badge | unit | `npx vitest run src/components/place-row.test.tsx` | ❌ Wave 0 |
| DISP-03 | MapView receives days with coordinates and renders Polyline per day | unit (mock) | `npx vitest run src/components/map-view.test.tsx` | ❌ Wave 0 |
| DISP-04 | Layout doesn't scroll horizontally at 375px | manual | manual browser test at 375px | manual-only |
| AUTH-01 | Full flow works without Supabase session | integration | manual browser test + existing route handler tests | manual-only |

**Note on DISP-03 testing:** `@vis.gl/react-google-maps` components require a real browser environment for full testing. Unit tests should mock the library and verify that `MapView` passes the correct `path` and `strokeColor` props to Polyline. Use `vi.mock('@vis.gl/react-google-maps', ...)` to return lightweight stubs.

### Sampling Rate

- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run` (full suite — 161 existing tests must remain green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/components/itinerary-view.test.tsx` — covers DISP-01
- [ ] `src/components/place-row.test.tsx` — covers DISP-02 (hoursUnknown badge, time slot display)
- [ ] `src/components/map-view.test.tsx` — covers DISP-03 (mocked vis.gl library)
- [ ] `src/providers/query-provider.test.tsx` — covers QueryProvider renders children

---

## Security Domain

Security enforcement is enabled (security_enforcement: true, ASVS level 1).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | AUTH-01 explicitly allows anonymous use; no auth gate in Phase 3 |
| V3 Session Management | No | No session created in Phase 3 (anonymous flow) |
| V4 Access Control | Partial | MapView uses NEXT_PUBLIC_ key — must be HTTP-referrer restricted in GCP Console |
| V5 Input Validation | Yes | User textarea input → split by newline → sent to /api/places/resolve (already Zod-validated server-side) |
| V6 Cryptography | No | No sensitive data stored client-side |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| NEXT_PUBLIC_ key leaked to browser | Information Disclosure | Restrict NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to HTTP referrers in GCP Console; Maps JS API only |
| XSS via displayName in InfoWindow | Tampering | React JSX escapes strings automatically; do not use dangerouslySetInnerHTML for place names |
| Prototype pollution via place list parsing | Tampering | Split by newline + filter — no JSON.parse of user input on client side |
| Click-handler infinite loop causing CPU DoS | Denial of Service | Use useCallback as documented in Pitfall 1 |
| Unvalidated placeId in coordinate lookup | Tampering | coordMap.get() returns undefined — optional chaining ?? 0 already in Pattern code above |

**Browser key exposure:** The `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally public (Maps JS API requires it). The only protection is HTTP referrer restriction in GCP Console + Maps JS API scope only. This is the standard Google Maps deployment pattern. [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Taiwan city coordinates in lookup table | Pattern 6 (buildCityBias) | Places resolve to wrong city; affects all non-Taipei searches |
| A2 | `@vis.gl/react-google-maps` v1.21.0 Polyline props match `path`, `strokeColor`, `strokeWeight`, `strokeOpacity` | Pattern 1 / Code Examples | TypeScript compile error; props may differ — verify against official docs at runtime |
| A3 | shadcn init with Tailwind v4 does not delete `--font-geist-sans` variables | Pitfall 4 | Font reverts to system default; easy fix if caught |
| A4 | `lucide-react` 0.4.6 exports `Clock`, `Car`, `X` icon names used in UI-SPEC | Code Examples | Import errors; icon may be named differently |
| A5 | NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is the correct env var name used in .env.local | Architecture | Map fails to load silently; check .env.example |

---

## Open Questions

1. **NEXT_PUBLIC env var name for Maps key**
   - What we know: .env.example documents `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; the UI-SPEC references `NEXT_PUBLIC_MAPS_KEY`
   - What's unclear: UI-SPEC section 7 says `apiKey={process.env.NEXT_PUBLIC_MAPS_KEY}` but the Phase 1 summary and .env.example say `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - Recommendation: Use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (matches .env.example); the planner should align the UI-SPEC reference

2. **OptimizeResult coordinates gap**
   - What we know: `ScheduledVisit` (Phase 2 output) has `placeId` and `displayName` but no `lat`/`lng`
   - What's unclear: Phase 3 must join the optimize result back to the resolve result to get coordinates for map rendering
   - Recommendation: Pass both `resolvedPlaces` (with lat/lng) and `optimizeResult` from PlaceInputPanel state down to ResultsLayout; build coordMap in ResultsLayout

3. **State management scope**
   - What we know: Phase 3 uses React state (useState) for the 3-step flow; TanStack Query is installed but not strictly needed for Phase 3 (both API calls are mutations, not queries)
   - What's unclear: Whether to use `useMutation` from TanStack Query or plain fetch + useState
   - Recommendation: Use plain `useState` + `fetch` for Phase 3 (matching the existing PlaceResolverForm pattern). TanStack Query will be used in Phase 4 for saved itinerary fetching.

---

## Sources

### Primary (MEDIUM confidence)
- [visgl.github.io/react-google-maps/docs](https://visgl.github.io/react-google-maps/docs/get-started) — APIProvider, Map, AdvancedMarker, Polyline, useMap, useMapsLibrary API reference
- [visgl.github.io/react-google-maps/docs/api-reference/components/advanced-marker](https://visgl.github.io/react-google-maps/docs/api-reference/components/advanced-marker) — useAdvancedMarkerRef, InfoWindow anchor pattern
- [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 CSS variables, @theme inline, OKLCH migration
- [ui.shadcn.com/docs/installation/next](https://ui.shadcn.com/docs/installation/next) — shadcn init for Next.js 15

### Secondary (MEDIUM confidence)
- [github.com/visgl/react-google-maps/discussions/404](https://github.com/visgl/react-google-maps/discussions/404) — AdvancedMarker infinite loop issue + memoized callback fix
- [ihsaninh.dev/blog/the-complete-guide-to-tanstack-query-next.js-app-router](https://ihsaninh.dev/blog/the-complete-guide-to-tanstack-query-next.js-app-router) — QueryClientProvider singleton pattern for Next.js App Router
- npm registry — @vis.gl/react-google-maps 1.21.0, lucide-react 0.4.6, next-themes 1.8.3

### Tertiary (LOW confidence)
- [medium.com — Next.js 15 hydration errors](https://medium.com/@blogs-world/next-js-hydration-errors-in-2026-the-real-causes-fixes-and-prevention-checklist-4a8304d53702) — dynamic import ssr:false pattern for Maps
- Taiwan city coordinates — derived from public sources; tagged [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — packages verified on npm registry; @vis.gl/react-google-maps API verified via official docs
- Architecture: MEDIUM — patterns confirmed via official docs and GitHub discussions; coordinate lookup table is ASSUMED
- Pitfalls: MEDIUM — Pitfall 1 (infinite loop) is confirmed via GitHub issue; others are training knowledge cross-checked with Next.js patterns

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stable libraries; check @vis.gl/react-google-maps changelog for breaking changes between 1.x minor versions)
