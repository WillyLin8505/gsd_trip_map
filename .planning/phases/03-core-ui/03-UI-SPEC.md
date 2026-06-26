---
status: draft
phase: 03
phase_name: core-ui
created: "2026-06-26T00:00:00Z"
tool: shadcn/ui (pending initialization — no components.json found)
---

# UI-SPEC: Phase 3 — Core UI

**Phase goal:** An anonymous user can paste a list of places, see them resolved and confirmed, click "最佳化行程", and receive a day-by-day itinerary table and interactive map — all without creating an account.

**Language:** zh-TW (Traditional Chinese) for all labels, copy, warnings, and CTA text.

---

## 1. Design System

### Tool

| Item | Value | Source |
|------|-------|--------|
| Component library | shadcn/ui (latest) | CLAUDE.md / STACK.md |
| Styling | Tailwind CSS v4 (zero-config, no tailwind.config.ts) | CLAUDE.md / globals.css |
| Icons | Lucide React ^0.400.x | CLAUDE.md |
| Dark mode | next-themes ^0.3.x | CLAUDE.md |
| Map component | @vis.gl/react-google-maps ^1.x | CLAUDE.md / STACK.md |
| Font | Geist Sans (variable: --font-geist-sans) / Geist Mono for code | layout.tsx |

### shadcn Initialization Gate

`components.json` does NOT exist in the project root. shadcn has not been initialized.

**Action required before executor runs:** Initialize shadcn with the following preset parameters:

```bash
npx shadcn@latest init
```

Recommended responses during init:
- Style: **Default** (neutral base)
- Base color: **Zinc** (maps to gray-* already used in existing component)
- CSS variables: **yes**

After init, confirm `components.json` exists and run `npx shadcn info` before proceeding to plan tasks.

**Missing packages to install before Phase 3 tasks:**

```bash
npm install lucide-react next-themes @vis.gl/react-google-maps
```

### Registry

| Registry | Blocks | Safety Gate |
|----------|--------|-------------|
| shadcn official (ui.shadcn.com) | Button, Input, Textarea, Card, Badge, Separator, ScrollArea, Tabs, Skeleton, Alert, Tooltip | Not applicable — official registry |
| Third-party | none | Not applicable |

---

## 2. Spacing Scale

8-point scale — all spacing values must be multiples of 4px.

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px | Icon-to-label gap, badge internal padding |
| `space-2` | 8px | Input field internal padding (vertical), list item gap |
| `space-3` | 12px | Card internal padding (compact), inline element gaps |
| `space-4` | 16px | Card internal padding (standard), section gap, form field gap |
| `space-6` | 24px | Between major sections within a card |
| `space-8` | 32px | Between page sections (PlaceInput → ItineraryView) |
| `space-12` | 48px | Page top/bottom padding on desktop |
| `space-44` | 44px | Minimum touch target height for interactive elements (mobile) |

**Exception:** Map container and itinerary panel are side-by-side on desktop and stacked on mobile. The map container uses `h-[400px]` on mobile and `h-full min-h-[600px]` on desktop — not a spacing token.

---

## 3. Typography

### Font Sizes (exactly 4)

| Token | Size | Line Height | Weight | Use |
|-------|------|-------------|--------|-----|
| `text-sm` | 14px | 1.5 (21px) | 400 | Captions, helper text, address lines, timestamps, badge labels |
| `text-base` | 16px | 1.5 (24px) | 400 | Body text, place names in resolved list, itinerary row labels |
| `text-lg` | 18px | 1.4 (25px) | 600 | Card headings (e.g., "第 1 天"), section sub-headings |
| `text-2xl` | 24px | 1.2 (29px) | 700 | Page title "旅遊行程規劃器" |

### Font Weights (exactly 2)

| Weight | Token | Use |
|--------|-------|-----|
| 400 | `font-normal` | All body copy, captions, address text |
| 600 | `font-semibold` | Card headings, place display names in itinerary rows, time slots |
| 700 | `font-bold` | Page title only |

**Note:** `font-bold` (700) is reserved for the single page title. All other emphasis uses `font-semibold` (600).

### Mono Font

`font-mono` (Geist Mono) is used for coordinate display only (e.g., lat/lng in debug views). Not used in production UI.

---

## 4. Color Contract (60 / 30 / 10 Rule)

### Tailwind v4 Custom Tokens (in globals.css @theme inline)

The existing globals.css defines `--color-background` and `--color-foreground`. Phase 3 extends this with semantic tokens for the card surface and accent:

```css
@theme inline {
  --color-background: var(--background);       /* #ffffff light / #0a0a0a dark */
  --color-foreground: var(--foreground);        /* #171717 light / #ededed dark */
  --color-surface: #f9fafb;                     /* gray-50 — card backgrounds */
  --color-border: #e5e7eb;                      /* gray-200 — card and input borders */
  --color-muted: #6b7280;                       /* gray-500 — secondary text */
  --color-accent: #2563eb;                      /* blue-600 — primary CTA, focus rings */
  --color-accent-hover: #1d4ed8;                /* blue-700 — hover state for accent */
  --color-destructive: #dc2626;                 /* red-600 — error messages only */
}
```

### Color Distribution

| Role | Tailwind Class | % of Surface | Reserved For |
|------|---------------|-------------|--------------|
| Dominant (page background) | `bg-gray-50` | 60% | `<body>`, page shell, input area background |
| Secondary (card / panel surface) | `bg-white` | 30% | PlaceInput card, resolved-places card, itinerary day cards, map panel background |
| Accent | `bg-blue-600` / `text-blue-600` | 10% | Primary CTA button only ("查詢地點" / "最佳化行程"), focus rings on inputs, active tab indicator, numbered map marker backgrounds |
| Destructive | `bg-red-50` / `text-red-700` / `border-red-200` | Contextual | Error alert banners, validation error text, destructive action labels |

### Semantic Color Rules

- Accent (`blue-600`) is **only** used for: primary CTA buttons, focus rings (`ring-blue-500`), numbered markers on map, active progress step.
- `blue-50` background with `blue-700` text is used for informational callouts (e.g., "已解析 N 個地點，請確認後繼續").
- `amber-50` / `amber-700` / `border-amber-200` is used exclusively for hoursUnknown warning badges and alert rows.
- `gray-100` is used for disabled button backgrounds.
- Do NOT use green in this phase — success states use blue confirmation banners, not green checkmarks.

### Map Day Colors (DISP-03)

Each day's polyline and markers use a distinct color. Use this fixed palette (ordered):

| Day | Polyline Stroke Color | Marker Background |
|-----|----------------------|-------------------|
| Day 1 | `#2563EB` (blue-600) | `#2563EB` |
| Day 2 | `#16A34A` (green-600) | `#16A34A` |
| Day 3 | `#D97706` (amber-600) | `#D97706` |
| Day 4 | `#9333EA` (purple-600) | `#9333EA` |
| Day 5 | `#DC2626` (red-600) | `#DC2626` |
| Day 6+ | Cycle from Day 1 palette using `dayIndex % 5` | Same cycle |

Polyline stroke width: `4px`. Polyline opacity: `0.85`.

---

## 5. Component Inventory

All shadcn/ui components are used in their default variant unless specified. Install with `npx shadcn@latest add {component}`.

### shadcn Components Required

| Component | Install Command | Used In |
|-----------|----------------|---------|
| `button` | `npx shadcn@latest add button` | CTA: "查詢地點", "最佳化行程", "重新輸入", "確認地點" |
| `input` | `npx shadcn@latest add input` | City field |
| `textarea` | `npx shadcn@latest add textarea` | Place list multi-line input |
| `card` | `npx shadcn@latest add card` | PlaceInput card, each resolved place, each itinerary day |
| `badge` | `npx shadcn@latest add badge` | hoursUnknown warning, price level, "已解析" status |
| `separator` | `npx shadcn@latest add separator` | Between place rows in itinerary |
| `scroll-area` | `npx shadcn@latest add scroll-area` | Itinerary panel (fixed height, scrollable) |
| `skeleton` | `npx shadcn@latest add skeleton` | Loading states during resolve and optimize |
| `alert` | `npx shadcn@latest add alert` | Error banners, hoursUnknown summary warning |
| `tooltip` | `npx shadcn@latest add tooltip` | Map marker popup: place name + time slot |
| `tabs` | `npx shadcn@latest add tabs` | Mobile: toggle between "行程表" / "地圖" views |

### Custom Components (not in shadcn registry)

| Component | File Path | Description |
|-----------|-----------|-------------|
| `PlaceInputPanel` | `src/components/place-input-panel.tsx` | Replaces PlaceResolverForm. Manages the 3-step flow: input → resolve → confirm |
| `ResolvedPlaceList` | `src/components/resolved-place-list.tsx` | Shows resolved places with address confirmation. Each item has a remove button. |
| `OptimizeButton` | inside PlaceInputPanel | Triggers POST /api/optimize after user confirms resolved places. Shows step-by-step progress labels. |
| `ItineraryView` | `src/components/itinerary-view.tsx` | Day-by-day itinerary table. Renders DayCard components. |
| `DayCard` | `src/components/day-card.tsx` | Single day accordion/card. Header: "第 N 天". Body: ordered PlaceRow list. |
| `PlaceRow` | `src/components/place-row.tsx` | Single place in itinerary. Shows arrival/departure time, duration, opening hours, price level, hoursUnknown badge. |
| `MapView` | `src/components/map-view.tsx` | `'use client'` component. Wraps @vis.gl/react-google-maps `<Map>`. Renders per-day Polylines and numbered AdvancedMarkers. |
| `DayLegend` | inside MapView | Color legend pills: "第 1 天 (藍)" etc. Positioned top-right inside map container. |
| `UnscheduledAlert` | `src/components/unscheduled-alert.tsx` | Alert shown when /api/optimize returns `unscheduled` places. Lists reasons. |
| `ProgressSteps` | `src/components/progress-steps.tsx` | 3-step progress indicator: "輸入地點" → "確認地點" → "查看行程". |

---

## 6. Layout Structure

### Page Layout (all screen sizes)

```
<main class="max-w-7xl mx-auto px-4 py-8">
  <ProgressSteps />          ← 3-step indicator, sticky on mobile

  <!-- Step 1 & 2: Input + Confirm (hidden once itinerary shown) -->
  <PlaceInputPanel />

  <!-- Step 3: Results (visible only after optimization) -->
  <!-- Desktop: two-column side-by-side -->
  <!-- Mobile: tabbed (行程表 / 地圖) -->
  <ResultsLayout>
    <ItineraryView />
    <MapView />
  </ResultsLayout>
</main>
```

### Desktop Layout (≥768px)

```
┌─────────────────────────────────────────────────────────┐
│  旅遊行程規劃器                    [ProgressSteps]       │
├──────────────────────┬──────────────────────────────────┤
│  ItineraryView       │  MapView                         │
│  (scroll-area,       │  (sticky, fills viewport height  │
│   w-2/5 or 480px)    │   minus header: h-[calc(...)])   │
│                      │                                  │
│  [DayCard Day 1]     │  [Google Map]                    │
│  [DayCard Day 2]     │  [DayLegend top-right]           │
│  ...                 │                                  │
└──────────────────────┴──────────────────────────────────┘
```

- Itinerary panel: `w-[420px] flex-shrink-0` on desktop, full-width on mobile.
- Map panel: `flex-1` on desktop, `h-[400px]` on mobile.
- Two-column split: `flex flex-col md:flex-row gap-6`.

### Mobile Layout (375px viewport — DISP-04)

- Single column. ProgressSteps collapses to dot indicators.
- After optimization, show `<Tabs>` with "行程表" and "地圖" tabs.
- ItineraryView tab: full-width, scrollable.
- MapView tab: `h-[calc(100vh-200px)]` to fill remaining viewport.
- No horizontal scrolling. All text wraps. DayCard headings use `text-lg`, not `text-2xl`.
- Touch targets: minimum `h-11` (44px) for all buttons and interactive rows.

---

## 7. Interaction Contract

### Flow A: Input Step (Step 1)

1. User sees `PlaceInputPanel` with two fields: "目的地城市" (Input) and "地點清單" (Textarea).
2. City field is required and validated before any API call (existing behavior, preserved).
3. "查詢地點" Button: `variant="default"` (blue-600 background). Disabled when either field is empty. Shows `<Skeleton>` rows in place of ResolvedPlaceList during loading.
4. Loading label text: "查詢中..." (existing, preserved).
5. Error state: `<Alert variant="destructive">` replaces inline error div.

### Flow B: Confirmation Step (Step 2)

1. After resolve, `ResolvedPlaceList` renders each resolved place as a `<Card>` row.
2. Each row shows: index number (1-based), `displayName` (`font-semibold`), `formattedAddress` (`text-sm text-muted-foreground`).
3. Each row has a remove button (Lucide `X` icon, `variant="ghost"`, `size="sm"`). Removing updates local state only — no API call.
4. Informational callout: `<Alert>` with blue-50 background: "已解析 N 個地點，請確認地點資訊是否正確，然後點擊「最佳化行程」"
5. "最佳化行程" primary CTA Button: disabled until at least 1 place remains. Shows progress steps during optimization.

### Flow C: Optimization Loading

1. When "最佳化行程" is clicked, show `<ProgressSteps>` with animated active step. Display these step labels sequentially:
   - Step 1: "取得地點詳細資訊..." (fetching place details)
   - Step 2: "計算行車時間..." (computing route matrix)
   - Step 3: "最佳化行程順序..." (running optimizer)
2. Each step shows a `<Skeleton>` placeholder where the itinerary will appear.
3. Do NOT disable the full page — only replace the button with a spinner label.

### Flow D: Itinerary View (Step 3)

1. Each `<DayCard>` is open by default (not collapsed). Header: "第 N 天" (`text-lg font-semibold`) + day summary "共 M 個地點".
2. Each `<PlaceRow>` shows:
   - Left: day-color dot (8px circle, matches map polyline color for that day)
   - Number index within day (e.g., "1.")
   - `displayName` (`font-semibold text-base`)
   - Time slot: "09:00 – 10:30" (`text-sm text-muted-foreground`)
   - Travel time from previous: "搭車 15 分" (Lucide `Car` icon, `text-xs`)
   - Opening hours: collapsed one-liner "每日 09:00–17:00" or "營業時間未知" (`text-sm`)
   - Price level: `<Badge variant="outline">$ / $$ / $$$ / $$$$</Badge>` if available
3. If `hoursUnknown: true`: show `<Badge variant="warning">` with Lucide `Clock` icon + text "營業時間未知，建議出發前確認" in amber styling (`bg-amber-50 text-amber-700 border-amber-200`). This badge appears inline in the PlaceRow AND in the map marker tooltip.
4. `<UnscheduledAlert>`: If `unscheduled` array is non-empty, show below the DayCard list. `<Alert variant="destructive">` title: "以下地點無法排入行程" + bulleted list of `displayName` + `reason` for each.

### Flow E: Map Interaction (DISP-03)

1. `<APIProvider apiKey={process.env.NEXT_PUBLIC_MAPS_KEY}>` wraps the map (browser-restricted Maps JS key only).
2. One `<Polyline>` per day, using that day's color from the palette. StrokeWeight: 4. StrokeOpacity: 0.85.
3. One `<AdvancedMarker>` per place. Marker content: a `<div>` with circular background in day-color, white text showing visit order within that day (e.g., "1", "2", "3").
4. Clicking a marker opens an `<InfoWindow>` (or shadcn `<Tooltip>` overlay): shows `displayName`, time slot, and hoursUnknown warning if applicable.
5. Map fits all markers on initial render via `useMapsLibrary('maps')` `LatLngBounds`. Zoom in/out freely.
6. `<DayLegend>` positioned `absolute top-3 right-3` inside map container: color pills for each day.

### States and Edge Cases

| State | UI Behavior |
|-------|-------------|
| No places resolved (empty result from API) | `<Alert>` "沒有找到符合的地點，請檢查輸入內容或城市名稱" |
| Single place input | Resolves normally; optimization produces 1-day itinerary with 1 stop |
| All places have `hoursUnknown: true` | Show global `<Alert variant="warning">` above DayCards: "所有地點的營業時間未知，建議出發前逐一確認" |
| Network error during resolve | `<Alert variant="destructive">` "網路錯誤，請稍後再試" (existing error copy preserved) |
| Network error during optimize | `<Alert variant="destructive">` "行程最佳化失敗，請重新嘗試" + "重試" Button |
| Map API key not set | Map container shows gray placeholder with text "地圖暫時無法顯示" |

---

## 8. Copywriting Contract

All user-facing text is Traditional Chinese (zh-TW). English is used only in code identifiers and developer-facing error codes.

### Primary CTA Labels

| CTA | Context | Text |
|-----|---------|------|
| Resolve places | Step 1 submit button | 查詢地點 |
| Resolving (loading) | During API call | 查詢中... |
| Confirm and optimize | Step 2 submit button | 最佳化行程 |
| Optimizing (loading) | During optimizer | 最佳化中... |
| Re-input | After optimization, return to step 1 | 重新輸入 |
| Remove place from list | Row action in ResolvedPlaceList | (icon only — X, aria-label="移除") |

### Empty States

| Scenario | Copy |
|----------|------|
| No places yet entered | Textarea placeholder: "每行輸入一個地點名稱，例如：\n台北101\n故宮博物院\n士林夜市" |
| No results from resolve | "沒有找到符合的地點，請檢查輸入內容或城市名稱" |
| Itinerary not yet generated | (PlaceInputPanel occupies full view — no separate empty state needed) |

### Error States (problem + action)

| Scenario | Copy |
|----------|------|
| City field empty on submit | "請輸入目的地城市" |
| Place list empty on submit | "請輸入至少一個地點名稱" |
| Resolve API failure | "地點查詢失敗，請稍後再試" |
| Optimize API failure | "行程最佳化失敗，請重新嘗試" |
| Network error | "網路錯誤，請稍後再試" |
| Map key missing | "地圖暫時無法顯示" |

### Informational Copy

| Context | Copy |
|---------|------|
| City field helper | "必填，用於縮小地點搜尋範圍" |
| Place list helper | "每行輸入一個地點名稱（中文名稱或 Google Maps 連結）" |
| Confirmation callout | "已解析 {N} 個地點，請確認地點資訊是否正確，然後點擊「最佳化行程」" |
| hoursUnknown inline badge | "營業時間未知，建議出發前確認" |
| hoursUnknown global alert | "所有地點的營業時間未知，建議出發前逐一確認" |
| Unscheduled places alert title | "以下地點無法排入行程" |
| Travel time between places | "搭車 {N} 分" |
| Day card header | "第 {N} 天" |
| Day card summary | "共 {M} 個地點" |

### Destructive Actions

There is one destructive action in this phase: removing a resolved place from the confirmation list.

| Action | Trigger | Confirmation approach |
|--------|---------|----------------------|
| Remove place from list | X icon button in ResolvedPlaceList row | No confirmation dialog — action is low-stakes and reversible (user can re-enter place). Provide visual feedback: row fades out with `transition-opacity duration-150`. |

---

## 9. Accessibility Contract

- All interactive elements have `aria-label` in zh-TW.
- `<html lang="zh-Hant">` already set in layout.tsx — do not change.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-blue-500` on all interactive elements.
- Color is never the sole indicator of meaning — hoursUnknown warning uses icon + text in addition to amber color.
- Map markers have `aria-label` with place name and visit order.
- Minimum touch target: 44x44px (`h-11 min-w-11`) for all buttons on mobile.
- Loading states announce via `aria-live="polite"` on the progress step container.
- Error alerts use `role="alert"` (shadcn Alert component handles this via `alertVariants`).

---

## 10. Responsive Breakpoints

| Breakpoint | Tailwind prefix | Layout behavior |
|------------|----------------|-----------------|
| 375px (mobile min) | (default, no prefix) | Single column. Tabs for itinerary/map toggle. |
| 768px (tablet+) | `md:` | Two-column split: itinerary left (w-[420px]), map right (flex-1). |
| 1280px (desktop) | `xl:` | Increased max-width padding. No structural change. |

No horizontal scroll at any breakpoint. Max-width container: `max-w-7xl mx-auto px-4`.

---

## 11. Pre-Population Sources

| Decision | Source | Value |
|----------|--------|-------|
| Font family | layout.tsx (existing) | Geist Sans |
| Background color | globals.css (existing) | #ffffff / #0a0a0a (light/dark) |
| Body background | layout.tsx (existing) | bg-gray-50 |
| Accent color | place-resolver-form.tsx (existing) | blue-600 (#2563EB) |
| Border color | place-resolver-form.tsx (existing) | gray-300 / gray-200 |
| Error color | place-resolver-form.tsx (existing) | red-50 / red-200 / red-700 |
| Language | layout.tsx (existing) | zh-Hant |
| Component library | CLAUDE.md | shadcn/ui |
| Icon library | CLAUDE.md | Lucide React |
| Map library | CLAUDE.md / STACK.md | @vis.gl/react-google-maps ^1.x |
| Min viewport | REQUIREMENTS.md DISP-04 | 375px |
| Anonymous access | REQUIREMENTS.md AUTH-01 | Full flow, no login |
| hoursUnknown warning | phase_context | Visible warning required in both itinerary table and map tooltip |
| Day color palette | phase_context (DISP-03) | Per-day distinct colors, defined in section 4 |

---

## 12. Out of Scope for This Phase

The following items are deferred and must NOT be implemented in Phase 3:

- User login / registration (AUTH-02, AUTH-03) — Phase 4
- Save itinerary (AUTH-04) — Phase 4
- Share link generation (AUTH-05) — Phase 4
- Manual visit duration override (INPUT-05) — Phase 5
- Dark mode toggle (next-themes is installed but UI toggle deferred to Phase 4 polish)
- Drag-to-reorder places — v2
- PDF / image export — v2
- Place photos — v2
