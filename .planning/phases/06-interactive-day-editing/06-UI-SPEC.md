---
status: draft
phase: 06
phase_name: interactive-day-editing
created: "2026-06-27T00:00:00Z"
tool: shadcn/ui (initialized in Phase 3 — components.json exists)
source: docs/superpowers/specs/2026-06-26-interactive-day-editing-design.md + 03-UI-SPEC.md (inherited design system)
---

# UI-SPEC: Phase 6 — Interactive Single-Day Editing

**Phase goal:** After an itinerary is generated, the user can refine it one day at a time — (F1) paste a new place to add it to the geographically closest day; (F2) press a per-day 「自動安排」 button to re-order that day by shortest path and slot restaurants into lunch/dinner windows. Editing one day never disturbs other days or wipes the itinerary.

**Language:** zh-TW (Traditional Chinese) for all labels, copy, warnings, CTA text.

> This phase ADDS to the existing results page. It inherits the full design system, spacing scale, typography, color contract, day-color palette, accessibility contract, and responsive breakpoints from **`03-UI-SPEC.md`** — that document remains authoritative for all shared tokens. Only the deltas for the two new interactions are specified here.

---

## 1. Design System (inherited)

Unchanged from `03-UI-SPEC.md` §1–§4: shadcn/ui + Tailwind v4 + Lucide + Geist; 8-pt spacing; 4 type sizes; 60/30/10 color (accent `blue-600`, destructive `red-600`, amber for warnings); per-day color palette (Day 1 blue → Day 5 red, cycle `dayIndex % 5`). `components.json` already exists (initialized Phase 3) — **no shadcn init needed**.

**New shadcn components required (add if not already present):**

| Component | Install Command | Used In |
|-----------|----------------|---------|
| `input` | `npx shadcn@latest add input` | F1 paste field (already present from Phase 3) |
| `button` | `npx shadcn@latest add button` | F1 「加入行程」, F2 「自動安排」 (already present) |
| `alert` | `npx shadcn@latest add alert` | inline add/arrange error rows (already present) |

No new third-party registry blocks. No safety gate.

---

## 2. New Components

| Component | File Path | Description |
|-----------|-----------|-------------|
| `DayPlaceAdder` | `src/components/day-place-adder.tsx` | F1. A single-line Input + 「加入行程」 Button. On submit: resolve → pick closest day → POST `/api/optimize/day` (reorder=false) → `replaceDay`. Owns its own input/loading/error state. Rendered once, near the itinerary (see §4 placement). |
| Auto-arrange button | inside `src/components/day-card.tsx` (`DayCard` header) | F2. A 「自動安排」 Button injected into each `DayCard` `CardHeader` via a new `onAutoArrange?: (dayNumber: number) => void` prop + per-day `isArranging` / `arrangeError` state. |

**Modified components (per 06-RESEARCH.md threading map):**

| Component | Change |
|-----------|--------|
| `place-input-panel.tsx` | Add `replaceDay(dayNumber, newDay)` updater (functional `setOptimizeResult`); merge new place coords into `resolvedPlaces`; render `DayPlaceAdder`; pass `onAutoArrange` down through `ResultsLayout` → `ItineraryView` → `DayCard`. |
| `results-layout.tsx`, `itinerary-view.tsx` | Forward the new `onAutoArrange` / add-handler props (no visual change). |
| `day-card.tsx` | Render the 「自動安排」 button in the header; show per-day inline error + spinner. |

---

## 3. Interaction Contract

### Flow F1 — Add a place to the closest day (EDIT-01)

1. `DayPlaceAdder` shows: an `Input` (placeholder `貼上地點名稱或 Google Maps 連結`) + a primary `Button` 「加入行程」 (`variant="default"`, blue-600). Button disabled when the input is empty or while a request is in flight.
2. On click:
   - Button enters loading: label 「加入中...」, disabled, optional Lucide `Loader2` spinner (`animate-spin`).
   - Client calls `POST /api/places/resolve` (city = current `resolvedCity`, or omit) → takes the first resolved place → `pickClosestDay(newPlace, daysWithCoords)` → `POST /api/optimize/day { placeIds:[...thatDay's placeIds, newPlaceId], reorder:false, dayNumber, travelDate }` → `replaceDay`.
3. **Success:** the new place appears in its day (re-timed, existing order otherwise preserved); the input clears; the map marker for that day updates (coords merged into `resolvedPlaces`). Brief confirmation is implicit (the row appears) — no toast required. Optionally announce via `aria-live`.
4. **NOT_FOUND (resolve returns nothing):** inline `Alert variant="destructive"` directly under the input: 「找不到這個地點」. Input value retained so the user can edit. Itinerary unchanged.
5. **API / network error (resolve or day call):** inline `Alert variant="destructive"`: 「加入地點失敗，請稍後再試」. Itinerary unchanged (never wiped).

### Flow F2 — Auto-arrange one day (EDIT-02)

1. Each `DayCard` header (next to 「第 N 天 · 共 M 個地點」) has a secondary `Button` 「自動安排」 (`variant="outline"`, `size="sm"`, Lucide `Wand2` or `Sparkles` icon). Min touch target 44px on mobile.
2. On click (that day only):
   - Button enters loading: label 「安排中...」, disabled, spinner. Other days' buttons remain enabled.
   - Client calls `POST /api/optimize/day { placeIds: thatDay's placeIds, reorder:true, dayNumber, travelDate }` → `replaceDay`.
3. **Success:** that day re-renders in shortest-path order; restaurants (餐廳) appear in the lunch (11:30–13:30) / dinner (17:30–19:30) windows; 點心 + 行程 sit as ordinary route stops. Other days untouched. The map polyline + marker order for that day update.
4. **Partial — `unscheduled` non-empty** (e.g. a place closed all day): render the existing `UnscheduledAlert` pattern (or an inline `Alert`) under that DayCard listing `displayName` + reason. The scheduled portion still renders. (Exact surface of per-day `unscheduled` is Claude's discretion per RESEARCH open question 2.)
5. **API / network error:** inline `Alert variant="destructive"` under that DayCard: 「自動安排失敗，請稍後再試」. The day is left exactly as it was (never wiped).

### States and Edge Cases

| State | UI Behavior |
|-------|-------------|
| F1 input empty | 「加入行程」 disabled |
| F1 request in flight | Button 「加入中...」 + spinner, disabled; input read-only |
| F1 place not found | Inline destructive Alert 「找不到這個地點」; itinerary unchanged |
| F1 added place has unknown opening hours | Re-timed day shows the inherited amber hoursUnknown badge (「營業時間未知，建議出發前確認」) on that row — reuse Phase 3 PlaceRow badge |
| F2 request in flight (one day) | Only that day's 「自動安排」 shows 「安排中...」; other days interactive |
| F2 day has 0 restaurants | Succeeds as plain shortest-path; no meal slotting; no error |
| F2 returns unscheduled places | UnscheduledAlert under that day; scheduled stops still shown |
| F1/F2 any failure | Inline Alert; itinerary state preserved — NEVER wiped |
| Single-day itinerary | F1 always targets day 1; F2 arranges day 1 normally |

---

## 4. Layout & Placement

Inherits the Phase 3 results layout (desktop two-column itinerary/map; mobile 行程表/地圖 tabs).

- **`DayPlaceAdder` (F1):** placed at the top of the `ItineraryView` column (above the DayCard list) so it is visible on both desktop and the mobile 行程表 tab. Full-width Input + Button on a single row on desktop; stacked (Input above Button) below 375px if needed to avoid cramping. Card-style container (`bg-white border rounded`) consistent with other panels, `space-4` padding.
- **「自動安排」 button (F2):** right-aligned in each `DayCard` `CardHeader`, opposite the 「第 N 天」 title. On mobile it wraps below the title if space is tight; keeps `h-11` (44px) touch height.
- No layout/structural change to the map column.

---

## 5. Copywriting Contract (zh-TW)

| Context | Copy |
|---------|------|
| F1 input placeholder | 貼上地點名稱或 Google Maps 連結 |
| F1 submit button | 加入行程 |
| F1 loading | 加入中... |
| F1 not found | 找不到這個地點 |
| F1 generic failure | 加入地點失敗，請稍後再試 |
| F2 button | 自動安排 |
| F2 loading | 安排中... |
| F2 generic failure | 自動安排失敗，請稍後再試 |
| Unscheduled alert title (reused) | 以下地點無法排入行程 |
| hoursUnknown badge (reused) | 營業時間未知，建議出發前確認 |
| Day card header (reused) | 第 {N} 天 |

English appears only in code identifiers / dev error codes.

---

## 6. Accessibility Contract (inherited + deltas)

Inherits `03-UI-SPEC.md` §9. Deltas:

- F1 Input has `aria-label="新增地點"`; 「加入行程」 button has accessible label.
- Each 「自動安排」 button has `aria-label="自動安排第 {N} 天"` so screen readers distinguish per-day buttons.
- In-flight buttons set `aria-busy="true"`; success/error regions use `aria-live="polite"` (errors `role="alert"` via shadcn Alert).
- Color is never the sole signal — errors use icon + text; restaurants in meal slots are conveyed by their time slot text, not color alone.
- Min touch target 44px (`h-11`) for the F1 button and every per-day F2 button at 375px.

---

## 7. Pre-Population Sources

| Decision | Source | Value |
|----------|--------|-------|
| Design system / tokens | 03-UI-SPEC.md | Inherited verbatim |
| Accent / destructive / amber colors | 03-UI-SPEC.md §4 | blue-600 / red-600 / amber-* |
| Day-color palette | 03-UI-SPEC.md §4 (DISP-03) | Day 1 blue … cycle %5 |
| zh-TW language | layout.tsx | lang="zh-Hant" |
| Meal windows | 06-CONTEXT.md / spec | Lunch 11:30–13:30 · Dinner 17:30–19:30 |
| 3-category classifier | 06-CONTEXT.md / spec | 餐廳→meal slot; 點心+行程→route stop |
| Closest-day metric | 06-CONTEXT.md / spec | min haversine over a day's places |
| Component threading map | 06-RESEARCH.md | place-input-panel → ResultsLayout → ItineraryView → DayCard |
| Min viewport | REQUIREMENTS.md DISP-04 | 375px |

---

## 8. Out of Scope for This Phase

- AI-recommended places / restaurants (Part B) — separate spec.
- Cross-day moves / drag-and-drop reordering — v2.
- Persisting edits separately from the existing save flow (save re-saves current state).
- Forwarding `durationOverrides` (INPUT-05) into the day route — known v1 limitation (RESEARCH open question 1); F2 re-times using default/detail durations.
- Any change to the input/confirm steps or the map column structure.
