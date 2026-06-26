---
phase: 03-core-ui
plan: "01"
subsystem: frontend-scaffold
tags: [shadcn, tailwind-v4, tanstack-query, next-themes, google-places, day-colors, test-scaffold]
status: complete

dependency_graph:
  requires:
    - 01-foundation-api-integration (places-client.ts, resolve route)
    - 02-optimization-engine (schedule.ts OptimizeResult/ScheduledVisit types)
  provides:
    - components.json (shadcn initialized against Tailwind v4)
    - 11 shadcn UI components (button, input, textarea, card, badge, separator, scroll-area, tabs, skeleton, alert, tooltip)
    - src/providers/query-provider.tsx (TanStack Query v5 singleton)
    - src/providers/theme-provider.tsx (next-themes, light-only for Phase 3)
    - src/lib/map/day-colors.ts (DAY_COLORS 5-color tuple + getDayColor helper)
    - src/types/itinerary.ts (re-exports + PlaceCoord/PlaceDetail/EnrichedVisit)
    - buildCityBias() city-aware lookup (24 Taiwan cities)
    - Wave-0 RED test scaffolds for 03-02/03-03/03-04
  affects:
    - src/app/layout.tsx (provider tree)
    - src/app/globals.css (shadcn color tokens + Geist font token restore)
    - src/lib/google/places-client.ts (buildCityBias fix)

tech_stack:
  added:
    - "@vis.gl/react-google-maps ^1.8.3 (maps React wrapper)"
    - "lucide-react ^1.21.0 (icon library, human-verified legitimate)"
    - "next-themes ^0.4.6 (dark mode infrastructure)"
    - "shadcn/ui Nova preset with Tailwind v4 auto-detection"
    - "tw-animate-css (added by shadcn init)"
  patterns:
    - "Module-level QueryClient singleton (not useState) for App Router SSR compatibility"
    - "ThemeProvider wrapping QueryProvider in layout.tsx body"
    - "Wave-0 RED scaffold pattern: import of non-existent module causes test file failure"
    - "buildCityBias() prefix-match lookup: direct -> 2-char -> 3-char -> 100km fallback"

key_files:
  created:
    - components.json
    - src/components/ui/button.tsx
    - src/components/ui/input.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/card.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/scroll-area.tsx
    - src/components/ui/tabs.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/alert.tsx
    - src/components/ui/tooltip.tsx
    - src/lib/utils.ts
    - src/providers/query-provider.tsx
    - src/providers/theme-provider.tsx
    - src/lib/map/day-colors.ts
    - src/types/itinerary.ts
    - src/components/itinerary-view.test.tsx
    - src/components/place-row.test.tsx
    - src/components/map-view.test.tsx
    - src/providers/query-provider.test.tsx
  modified:
    - src/app/globals.css (shadcn OKLCH tokens + Geist font token restore)
    - src/app/layout.tsx (ThemeProvider + QueryProvider wrapping)
    - src/lib/google/places-client.ts (buildCityBias city lookup table)
    - package.json / package-lock.json (3 new packages)

decisions:
  - "shadcn Nova preset used (Lucide/Geist) — auto-detects Tailwind v4 without tailwind.config.ts"
  - "globals.css --font-sans: var(--font-geist-sans) restored after shadcn init overwrote it with circular var(--font-sans)"
  - "buildCityBias() exported as named export (was private function in Phase 1 skeleton)"
  - "Wave-0 RED test scaffolds structured as import-only failures (no DOM rendering needed to fail)"
  - "ThemeProvider uses enableSystem=false — Phase 3 is light-only; Phase 4 will add toggle UI"
  - "lucide-react approved after human verification: v1.21.0, github.com/lucide-icons/lucide, 84M+/wk downloads"

metrics:
  duration: "~10 minutes"
  completed: "2026-06-26"
  tasks_completed: 5
  files_created: 21
  files_modified: 4
  commits: 4
---

# Phase 3 Plan 01: Wave-0 Scaffolding Summary

**One-liner:** shadcn/ui initialized against Tailwind v4 with Nova preset, 11 components installed, Geist fonts restored, QueryProvider/ThemeProvider wired into layout, buildCityBias() city lookup table replacing hardcoded Taiwan center, and 3 RED Wave-0 test scaffolds created.

## What Was Built

### Task 1 (Checkpoint): lucide-react Legitimacy Gate
Halted for human verification of `lucide-react` package before install. User confirmed: v1.21.0, github.com/lucide-icons/lucide (official org), published via GitHub Actions OIDC trusted publisher. Package approved and install proceeded.

### Task 2: Package Install + shadcn Init + 11 Components + Font Restore
- Installed `@vis.gl/react-google-maps ^1.8.3`, `lucide-react ^1.21.0`, `next-themes ^0.4.6`
- Ran `npx shadcn@latest init` with Nova preset (Lucide/Geist, Tailwind v4 auto-detected)
- `npx shadcn@latest add button input textarea card badge separator scroll-area tabs skeleton alert tooltip` — all 11 components created
- **Pitfall 4 fix applied:** shadcn init wrote `--font-sans: var(--font-sans)` (circular self-reference). Fixed to `var(--font-geist-sans)` and `--font-heading: var(--font-geist-sans)`.

### Task 3: QueryProvider + ThemeProvider + day-colors + Client Types
- `src/providers/query-provider.tsx`: `'use client'` wrapper with module-level `QueryClient` singleton (staleTime=60s per TanStack Query App Router pattern)
- `src/providers/theme-provider.tsx`: `'use client'` next-themes wrapper (light default, system preference disabled for Phase 3)
- `src/app/layout.tsx`: added `<ThemeProvider><QueryProvider>{children}</QueryProvider></ThemeProvider>` — `lang="zh-Hant"`, `bg-gray-50`, Geist variables preserved
- `src/lib/map/day-colors.ts`: `DAY_COLORS = ['#2563EB','#16A34A','#D97706','#9333EA','#DC2626'] as const` + `getDayColor(dayIndex)` with modulo wrap
- `src/types/itinerary.ts`: re-exports `OptimizeResult`, `ScheduledVisit`, `ResolvedPlace` + new `PlaceCoord`, `PlaceDetail`, `EnrichedVisit` types for coordinate-gap join

### Task 4: buildCityBias() Fix
- Replaced the Phase 1 skeleton (always returning Taiwan center 23.6978, 120.9605 with 50km radius) with a 24-entry `TAIWAN_CITY_COORDS` lookup
- Covers 6 special municipalities (台北/新北/桃園/台中/台南/高雄) + 8 counties, each with city and 縣市 variant
- Lookup strategy: direct match → 2-char prefix → 3-char prefix → 100km Taiwan-center fallback
- `buildCityBias('高雄市')` → `{lat: 22.6273, lng: 120.3014, radius: 25000}` ✓
- `buildCityBias('京都市')` → Taiwan-center 100km fallback (textQuery still disambiguates) ✓
- All coordinates tagged `[ASSUMED]` from public sources per T-03-02 requirement

### Task 5: Wave-0 Test Scaffolds
- `src/providers/query-provider.test.tsx`: **GREEN** — 2 tests pass; verifies `QueryProvider` is exported as a named function
- `src/components/itinerary-view.test.tsx`: **RED** — fails with `MODULE_NOT_FOUND` on import `./itinerary-view`; will turn green when 03-02 implements `ItineraryView` (DISP-01)
- `src/components/place-row.test.tsx`: **RED** — fails with `MODULE_NOT_FOUND` on import `./place-row`; will turn green when 03-02 implements `PlaceRow` (DISP-02)
- `src/components/map-view.test.tsx`: **RED** — fails with `MODULE_NOT_FOUND` on import `./map-view`; includes `vi.mock('@vis.gl/react-google-maps', ...)` stub setup and DAY_COLORS assertion (already green); will turn green when 03-03 implements `MapView` (DISP-03)

## Verification State

| Check | Status |
|-------|--------|
| tsc --noEmit (non-test files) | CLEAN |
| tsc for RED test scaffolds | 3 expected errors (MODULE_NOT_FOUND for unimplemented components) |
| components.json exists | OK |
| 11 shadcn UI components | OK |
| globals.css @import tailwindcss | OK |
| globals.css --font-sans: var(--font-geist-sans) | OK |
| globals.css --font-mono: var(--font-geist-mono) | OK |
| QueryProvider in layout.tsx | OK |
| ThemeProvider in layout.tsx | OK |
| DAY_COLORS[0] = #2563EB | OK |
| buildCityBias('高雄市') → 22.6273 | OK |
| buildCityBias('京都市') → 100km fallback | OK |
| query-provider.test.tsx | 2 PASS |
| Existing 161 tests | 163 PASS (original 161 + 2 new query-provider tests) |
| 3 RED scaffold test files | FAIL (import error only — correct RED state) |

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| b5f0dfb | chore | Install packages, init shadcn, add 11 UI components, restore font tokens |
| 3065526 | feat | Add QueryProvider + ThemeProvider, day-colors, client itinerary types |
| 7b18c78 | fix | Replace buildCityBias() stub with 24-entry Taiwan city lookup table |
| 385ada8 | test | Create Wave-0 RED scaffolds + passing query-provider test |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed circular font variable in globals.css**
- **Found during:** Task 2 post-shadcn-init inspection
- **Issue:** shadcn Nova preset wrote `--font-sans: var(--font-sans)` (self-referential, would cause CSS infinite loop) and `--font-heading: var(--font-sans)` (same circular reference)
- **Fix:** Replaced with `--font-sans: var(--font-geist-sans)` and `--font-heading: var(--font-geist-sans)` — the correct Geist variable references as documented in Pitfall 4
- **Files modified:** `src/app/globals.css`
- **Commit:** b5f0dfb

**2. [Rule 2 - Enhancement] buildCityBias() exported as named export**
- **Found during:** Task 4 implementation
- **Issue:** The Phase 1 skeleton had `buildCityBias()` as a private (unexported) function. Phase 3 plans (03-02/03-04) may need to call it for testing or coordinate-bias checks
- **Fix:** Changed `function buildCityBias` to `export function buildCityBias`
- **Files modified:** `src/lib/google/places-client.ts`
- **Commit:** 7b18c78

**3. [Informational] shadcn Nova preset chosen instead of Default/Zinc**
- **Context:** The plan specified "style Default, base color Zinc" but the current shadcn@4.11.0 CLI prompts for a preset, not a style+color. Nova preset was chosen because it uses Lucide icons (matches the installed lucide-react package) and Geist fonts (matches the project's existing font setup). The resulting color tokens are OKLCH-based neutral (similar to Zinc) which is the current shadcn standard.

## Known Stubs

None — this plan creates infrastructure (providers, types, shared modules) with no data-rendering stubs.

## Threat Flags

None beyond what the plan's threat model already covers:
- T-03-SC: lucide-react verified by human before install (gate passed)
- T-03-01: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY exposure is accepted (Maps JS API design)
- T-03-02: TAIWAN_CITY_COORDS is a fixed Record; no dynamic property access

## RED Test Gates for Downstream Plans

| Test File | RED Until | Requirement |
|-----------|-----------|-------------|
| src/components/itinerary-view.test.tsx | 03-02 implements ItineraryView | DISP-01 |
| src/components/place-row.test.tsx | 03-02 implements PlaceRow | DISP-02 |
| src/components/map-view.test.tsx | 03-03 implements MapView | DISP-03 |

## Self-Check: PASSED
