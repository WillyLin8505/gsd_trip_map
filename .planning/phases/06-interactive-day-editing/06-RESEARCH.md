# Phase 6: Interactive Single-Day Editing — Research

**Researched:** 2026-06-27
**Domain:** Single-day itinerary mutation — pure optimizer primitives, new API route, results-page state updates
**Confidence:** HIGH (all findings sourced directly from the codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 3-category taxonomy: 餐廳 / 點心 / 行程 — only 餐廳 gets meal slots.
- Meal windows: Lunch 11:30–13:30; Dinner 17:30–19:30 (slot START must fall in window).
- Closest-day metric: `min haversine(newPlace, dayPlace)` over all places in each day.
- `scheduleSingleDay` signature and reorder=false / reorder=true behavior as specified in CONTEXT.md.
- `POST /api/optimize/day` body: `{ placeIds, reorder, dayNumber?, travelDate? }`.
- F1 flow: resolve → pickClosestDay → /api/optimize/day {reorder:false} → replaceDay.
- F2 flow: 「自動安排」 button → /api/optimize/day {reorder:true} → replaceDay.
- Error handling: day API failure keeps existing day; NOT_FOUND → "找不到這個地點"; missing place_types → treated as 行程.

### Claude's Discretion
- Exact component file layout for `DayPlaceAdder` and F2 button wiring within `place-input-panel.tsx` / `DayCard`.
- Loading/disabled states and inline-error copy beyond the locked NOT_FOUND string.
- Internal helper signatures not pinned (e.g., submatrix extraction utility).

### Deferred Ideas (OUT OF SCOPE)
- AI-recommended restaurants/places (Part B).
- Persisting edits separately from the existing save flow.
- Cross-day moves / drag-and-drop reordering (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | Paste a new place on the results page; system resolves it and appends it to the geographically closest existing day (re-times that day, keeps order). Does not re-run the whole itinerary. | `/api/places/resolve` response shape verified; `pickClosestDay` pure helper design; `POST /api/optimize/day {reorder:false}` mirrors existing route pattern; `replaceDay` updater location identified in place-input-panel. |
| EDIT-02 | Per-day 「自動安排」 button re-orders only that day: shortest path + restaurants into lunch/dinner windows; 點心 and 行程 are ordinary route stops. | `nearestNeighbor`/`twoOptImprove` signatures verified; `scheduleTimes` time-walk reuse pattern confirmed; `DayCard` header is the injection point for the button; `place_types` column confirmed in DB. |
</phase_requirements>

---

## Summary

Phase 6 adds two post-generation editing features that mutate a single day without touching the rest of the itinerary. The full codebase was read; all findings below are sourced from the actual files, not from documentation or training assumptions.

The core new primitive is `scheduleSingleDay` in `src/lib/optimizer/day.ts` (new file). It reuses the time-walk from `scheduleTimes` by calling it with a single-element `dayOrders` array, then relabeling the `dayNumber` in the output. For F2 it pre-computes a merged stop order (attractions via NN+2-opt over a submatrix, restaurants injected at lunch/dinner clock positions) before handing that complete sequence to `scheduleTimes`.

The new API route `POST /api/optimize/day` mirrors the existing `POST /api/optimize` route almost exactly — same Zod schema extension, same DB load pattern, same `computeRouteMatrix` call, same 422/500 guards. The results page already holds all the state needed; `replaceDay` is a one-liner `setOptimizeResult` updater and the F2 button can be wired into `DayCard` by passing a new `onAutoArrange` prop down the existing chain.

**Primary recommendation:** Build `scheduleSingleDay` as a thin wrapper over existing primitives; copy the route handler pattern verbatim; add `onAutoArrange`/`onAddPlace` props to `DayCard` without restructuring any existing component.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Place resolution (F1 text → placeId) | API / Backend (`/api/places/resolve`) | — | All Google calls server-side per CLAUDE.md |
| Closest-day selection (F1) | Browser / Client (`pickClosestDay` pure helper) | — | Pure haversine; no I/O; coordinates are already in client state |
| Single-day scheduling (F1 + F2) | API / Backend (`/api/optimize/day`) | — | Needs DB read (place_types, opening hours) + Routes API call |
| `scheduleSingleDay` pure function | Optimizer lib (server-side import) | — | No I/O; called by route handler only |
| `classifyPlace` pure function | Optimizer lib | — | Stateless type-tag lookup |
| `replaceDay` client updater | Browser / Client (`place-input-panel.tsx`) | — | Updates React state; no server I/O |
| 「自動安排」 button trigger | Browser / Client (`DayCard`) | — | UI interaction; fires fetch to `/api/optimize/day` |
| `DayPlaceAdder` UI | Browser / Client | — | Input widget; coordinates resolve + pickClosestDay + day API calls |

---

## Standard Stack

All packages are already installed. Phase 6 installs NO new packages.

### Core (reused)
| Library | Current | Purpose in Phase 6 |
|---------|---------|---------------------|
| Next.js Route Handlers | 15.x | `POST /api/optimize/day` route |
| Zod | ^3.x | Request validation for new route |
| Drizzle ORM + pg | ^0.33.x / ^3.x | Load places rows in new route |
| `@/lib/google/routes-client` | local | `computeRouteMatrix` call in new route |
| `@/lib/optimizer/route.ts` | local | `nearestNeighbor`, `twoOptImprove` for F2 reorder |
| `@/lib/optimizer/schedule.ts` | local | `scheduleTimes`, `minutesToHHMM` time-walk reuse |
| shadcn/ui (Button, Input, Alert) | latest | `DayPlaceAdder` and 「自動安排」 button UI |

## Package Legitimacy Audit

No new packages are installed in Phase 6. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
F1 (Add place):
  User pastes text
    → DayPlaceAdder (client)
    → POST /api/places/resolve {inputs, city?}
    → ResolvedPlace {placeId, lat, lng}
    → pickClosestDay(newPlace, daysWithCoords)  [pure, client]
    → POST /api/optimize/day {placeIds:[...day+new], reorder:false, dayNumber, travelDate}
        → getDb() + load places rows (incl. place_types)
        → computeRouteMatrix(coords, apiKey)
        → scheduleSingleDay(places, matrix, opts, {reorder:false, dayNumber})
        → {day, unscheduled}
    → replaceDay(dayNumber, newDay)  [setOptimizeResult]
    → add newPlace to resolvedPlaces  [setResolvedPlaces, for coord-map join]

F2 (Auto-arrange):
  User clicks 「自動安排」 on DayCard
    → POST /api/optimize/day {placeIds: thatDay's placeIds, reorder:true, dayNumber, travelDate}
        → (same DB + matrix load)
        → scheduleSingleDay(places, matrix, opts, {reorder:true, dayNumber})
            → classifyPlace each place → R (restaurants) / A (snack+attraction)
            → nearestNeighbor(aSubmatrix) + twoOptImprove → A order
            → clock-walk A order; inject R at lunch/dinner windows
            → scheduleTimes([[finalOrder]], places, matrix, opts) [time-walk reuse]
            → relabel dayNumber in output
        → {day, unscheduled}
    → replaceDay(dayNumber, newDay)

Error paths:
  - day API failure → keep existing day, show inline error (never wipe optimizeResult)
  - resolve NOT_FOUND → show "找不到這個地點" (no day mutation)
  - place_types null → attraction fallback (per spec)
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── optimizer/
│   │   ├── day.ts             # NEW: scheduleSingleDay + classifyPlace
│   │   ├── route.ts           # EXISTING: nearestNeighbor, twoOptImprove
│   │   ├── schedule.ts        # EXISTING: scheduleTimes, minutesToHHMM
│   │   └── types.ts           # EXISTING: OptimizerPlace, TravelMatrix
│   ├── places/
│   │   └── closest-day.ts     # NEW: pickClosestDay (haversine)
│   └── validation/
│       └── optimize-day.ts    # NEW: Zod schema for /api/optimize/day
├── app/api/optimize/
│   ├── route.ts               # EXISTING
│   └── day/
│       ├── route.ts           # NEW: POST /api/optimize/day
│       └── route.test.ts      # NEW
├── components/
│   ├── day-card.tsx           # MODIFY: add onAutoArrange prop + 「自動安排」 button
│   └── day-place-adder.tsx    # NEW: DayPlaceAdder component
└── __tests__/  (or co-located)
    ├── day.test.ts            # NEW: classifyPlace + scheduleSingleDay
    └── closest-day.test.ts    # NEW: pickClosestDay
```

---

## Exact Signatures and Types (verified from source)

### `OptimizerPlace` — `src/lib/optimizer/types.ts`

```typescript
// src/lib/optimizer/types.ts:24–52
export interface OptimizerPlace {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  openingHours: import("@/lib/google/places-client").OpeningHoursPeriod[] | null;
  utcOffsetMinutes: number | null;
  visitDurationMinutes: number;
  hoursUnknown: boolean;
}
export type TravelMatrix = number[][];
```

### `ScheduledVisit` and `OptimizeResult` — `src/lib/optimizer/schedule.ts`

```typescript
// src/lib/optimizer/schedule.ts:33–64
export interface ScheduledVisit {
  placeId: string;
  displayName: string;
  scheduledStart: string;   // "HH:MM"
  scheduledEnd: string;     // "HH:MM"
  travelFromPrevMinutes: number;
  waitMinutes: number;
  hoursUnknown: boolean;
  warning?: string;
}

export interface OptimizeResult {
  suggestedDays: number;
  days: Array<{ dayNumber: number; visits: ScheduledVisit[] }>;
  unscheduled: Array<{ placeId: string; reason: string }>;
}

// ScheduleTimesOpts (travelDate REQUIRED here)
export interface ScheduleTimesOpts extends ScheduleOpts {
  travelDate: string;
}
export interface ScheduleOpts {
  dailyStartMinutes: number;
  dailyEndMinutes: number;
  travelDate?: string;
}
```

### `scheduleTimes` — `src/lib/optimizer/schedule.ts:274–375`

```typescript
export function scheduleTimes(
  dayOrders: number[][],      // one inner array per day; each entry is index into places[]
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  opts: ScheduleTimesOpts
): {
  days: Array<{ dayNumber: number; visits: ScheduledVisit[] }>;
  unscheduled: Array<{ placeId: string; reason: string }>;
}
```

**Key behaviors to reuse:**
- `dayOrders[dayIdx]` is a list of indices into `places[]`
- `dayNumber = dayIdx + 1` (zero-based position → 1-based output). For `scheduleSingleDay`, override this after the call.
- `hoursUnknown=true` places: slot always kept, emit `warning: "營業時間未知，建議出發前確認"`, skip `isOpenAt` check (Pitfall 3).
- Closed-on-day → pushed to `unscheduled` with reason string.
- `scheduledEnd > closeTime` → pushed to `unscheduled` with reason including close time.
- `currentTime` starts at `opts.dailyStartMinutes` (540 = 09:00 by default).

**CRITICAL:** `getOpenWindow` is a **private** function in `schedule.ts` — it is NOT exported. `scheduleSingleDay` CANNOT import it. Reuse the time-walk by calling `scheduleTimes([[...indices]], places, matrix, opts)` directly.

### `nearestNeighbor` and `twoOptImprove` — `src/lib/optimizer/route.ts`

```typescript
// src/lib/optimizer/route.ts:60–89
export function nearestNeighbor(
  matrix: TravelMatrix,
  startIndex = 0
): number[]  // permutation of [0..matrix.length-1]

// src/lib/optimizer/route.ts:117–152
export function twoOptImprove(
  order: number[],
  matrix: TravelMatrix,
  passes = 4
): number[]  // improved (or equal) permutation; does NOT mutate input
```

**Matrix alignment contract:** Both functions receive **full or sub** matrices. When running on a subset of places (the A-set for F2), you must:
1. Extract A-indices from full places array.
2. Build `aMatrix[a][b] = matrix[aIndices[a]][aIndices[b]]`.
3. Run `nearestNeighbor(aMatrix)` → result `[a0, a1, ...]` are indices into `aMatrix`.
4. Map back: `orderedAFull = nnResult.map(i => aIndices[i])` → indices into full `places[]`.

### `minutesToHHMM` — `src/lib/optimizer/schedule.ts:89–93`

```typescript
export function minutesToHHMM(minutes: number): string
// minutesToHHMM(690) → "11:30"  (lunch start)
// minutesToHHMM(810) → "13:30"  (lunch end)
// minutesToHHMM(1050) → "17:30" (dinner start)
// minutesToHHMM(1170) → "19:30" (dinner end)
```

### `computeRouteMatrix` — `src/lib/google/routes-client.ts:76–150`

```typescript
export interface RouteMatrixCoord { lat: number; lng: number; }

export async function computeRouteMatrix(
  coords: RouteMatrixCoord[],
  apiKey: string
): Promise<number[][]>
// Returns N×N matrix where matrix[i][j] = travel minutes from coords[i] to coords[j].
// Diagonal = 0. Unreachable pairs = Number.MAX_SAFE_INTEGER (NOT 0 or null).
// Throws Error on non-OK HTTP response.
```

**Matrix indexing contract:** `matrix[i][j]` aligns with `coords[i]` → `coords[j]`. The route handler builds `coords` in `placeIds` order via `orderedRows = placeIds.map(id => rowMap.get(id)!)`. The `day` route MUST follow the same ordering pattern.

### DB: `place_types` column — `src/lib/db/schema.ts:43`

```typescript
// places table, column definition:
place_types: text("place_types").array(),   // string[] | null
```

Populated ONLY by `GET /api/places/details`, NOT by `POST /api/places/resolve`. The `day` route reads `row.place_types` directly from the DB — no client involvement needed.

### `getDb()` — `src/lib/db/index.ts:37–42`

```typescript
export const getDb = cache((): NodePgDatabase | null => {
  // ...
  const pool = new Pool({ connectionString: conn, max: 5, maxUses: 1 });
  return drizzle(pool);
});
```

- Wrapped in React's `cache()` — memoized per request, returns same instance if called multiple times in one route handler.
- `maxUses: 1` is a Hyperdrive/Cloudflare Workers constraint. Do NOT call `getDb()` outside of a request context.
- Returns `null` when no DB configured — the route must guard with a 500.

---

## Existing Route Pattern to Mirror

### `src/app/api/optimize/route.ts` — reusable skeleton (file:line references)

| Step | Pattern | File:Line |
|------|---------|-----------|
| JSON parse guard | `try { body = await request.json() } catch { return 400 }` | route.ts:46–51 |
| Zod validation | `optimizeRequestSchema.safeParse(body)` → 400 with `parsed.error.flatten()` | route.ts:54–61 |
| `getDb()` null guard | `const db = getDb(); if (!db) return 500` | route.ts:67–73 |
| DB load | `db.select().from(places).where(inArray(places.place_id, placeIds))` | route.ts:78–82 |
| 422 unresolved | `foundIds = new Set(rows.map(r => r.place_id)); missingIds = placeIds.filter(...)` → `return 422` | route.ts:90–99 |
| API key guard | `process.env.GOOGLE_PLACES_API_KEY` → 500 if missing | route.ts:104–110 |
| Ordered rows + coords | `rowMap = new Map(...); orderedRows = placeIds.map(id => rowMap.get(id)!); coords = orderedRows.map(...)` | route.ts:120–127 |
| `computeRouteMatrix` with 502 | `try { matrix = await computeRouteMatrix(coords, apiKey) } catch { return 502 }` | route.ts:129–137 |
| `OptimizerPlace[]` mapping | See below | route.ts:152–174 |

### DB row → `OptimizerPlace` mapping (copy verbatim for `day` route)

```typescript
// src/app/api/optimize/route.ts:152–174
const optimizerPlaces: OptimizerPlace[] = orderedRows.map((row) => {
  const visitDurationMinutes =
    durationOverrides?.[row.place_id] ??
    row.default_visit_duration_minutes ??
    durationForTypes(row.place_types ?? []);

  const openingHours = row.hours_unknown
    ? null
    : (row.opening_hours as OpeningHoursPeriod[] | null);

  return {
    placeId: row.place_id,
    displayName: row.display_name,
    lat: row.lat,
    lng: row.lng,
    openingHours,
    utcOffsetMinutes: row.utc_offset_minutes ?? null,
    visitDurationMinutes,
    hoursUnknown: row.hours_unknown ?? false,
  };
});
```

NOTE: The `day` route does NOT have `durationOverrides` in the spec body. Omit that field. Use `row.default_visit_duration_minutes ?? durationForTypes(row.place_types ?? [])`.

---

## Results Page State and Threading

### State held in `place-input-panel.tsx` (verified)

```typescript
// src/components/place-input-panel.tsx:34–46
const [resolvedPlaces, setResolvedPlaces] = useState<ResolvedPlace[]>([]);
const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
const [resolvedCity, setResolvedCity] = useState<string | null>(null);
const [startDate, setStartDate] = useState<string>(""); // YYYY-MM-DD or ""
// numDays, durationOverrides also in state
```

`ResolvedPlace = { placeId, displayName, formattedAddress, lat, lng }` (from `src/lib/validation/resolve.ts:40-46`)

`OptimizeResult = { suggestedDays: number; days: Array<{ dayNumber: number; visits: ScheduledVisit[] }>; unscheduled: Array<{ placeId: string; reason: string }> }` (from `src/lib/optimizer/schedule.ts:55-64`)

### `replaceDay` implementation

```typescript
// Add to place-input-panel.tsx (new handler)
function replaceDay(dayNumber: number, newDay: { dayNumber: number; visits: ScheduledVisit[] }) {
  setOptimizeResult(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      days: prev.days.map(d => d.dayNumber === dayNumber ? newDay : d),
    };
  });
}
```

### Threading chain for new props

```
place-input-panel.tsx
  → ResultsLayout (itinerary, resolvedPlaces, detailsById, onDurationChange)
      → ItineraryView (itinerary, detailsById, onDurationChange)
          → DayCard (day, detailsById, onDurationChange)
```

**New props needed:**
- `DayCard`: add `onAutoArrange?: (dayNumber: number) => void` for F2 button
- `ItineraryView`: forward `onAutoArrange` to each `DayCard`
- `ResultsLayout`: forward `onAutoArrange` from `place-input-panel`
- `DayPlaceAdder`: a new standalone component — can receive `resolvedCity`, `startDate`, `optimizeResult` (to extract per-day placeIds), `replaceDay`, `setResolvedPlaces` as props OR be rendered inside `place-input-panel`'s results branch

### `daysWithCoords` (F1 `pickClosestDay` input)

`ResultsLayout` already builds this via `buildDaysWithCoords` (results-layout.tsx:52–68). For the client-side `pickClosestDay`, `place-input-panel` has the same data available from `optimizeResult.days` + `resolvedPlaces`. Recompute inline or extract the helper.

### `resolvedCity` availability for F1

`resolvedCity` is state in `place-input-panel.tsx:42`. Available to the results branch where `DayPlaceAdder` would live. Pass as a prop.

### `startDate` (travelDate) availability for F1 + F2

`startDate` is state in `place-input-panel.tsx:41`. Pass to the handlers that build the day API body. If `startDate` is empty, the day route should default to next Monday (same as `optimize()` in `src/lib/optimizer/index.ts:46–56`).

---

## `/api/places/resolve` Request/Response Shape

```typescript
// POST /api/places/resolve
// Request body (src/lib/validation/resolve.ts:10–35):
{ inputs: string[], city?: string, locationBias?: { lat, lng, radiusMeters } }
// city: optional but min(1) if provided — do NOT send city: "" (empty string fails validation)

// Response (src/lib/validation/resolve.ts:55–62):
{
  places: Array<
    | { placeId: string; displayName: string; formattedAddress: string; lat: number; lng: number }
    | { original_query: string; status: "NOT_FOUND" }
  >;
  resolvedCity: string | null;
  cityInferred: boolean;
}
```

**F1 call pattern:**
```typescript
const body = resolvedCity
  ? { inputs: [pastedText], city: resolvedCity }
  : { inputs: [pastedText] };
await fetch("/api/places/resolve", { method: "POST", body: JSON.stringify(body) });
```

**IMPORTANT:** `POST /api/places/resolve` does NOT write `place_types` to the DB. The upsert in the resolve route writes only: `place_id, display_name, address, lat, lng, hours_unknown=false, updated_at`. (src/app/api/places/resolve/route.ts:137–159). The new place will have `place_types = null` in the DB until `GET /api/places/details` is called for it.

---

## `scheduleSingleDay` Design (reuse of `scheduleTimes`)

### Signature (from CONTEXT.md)
```typescript
// src/lib/optimizer/day.ts (new file)
export function scheduleSingleDay(
  places: OptimizerPlace[],
  matrix: TravelMatrix,
  opts: ScheduleTimesOpts,
  mode: { reorder: boolean; dayNumber: number }
): {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
}

export function classifyPlace(
  placeTypes: string[] | null
): "restaurant" | "snack" | "attraction"
```

### `reorder=false` path (F1)

```typescript
// Keep given order (places[0], places[1], ...); indices = [0, 1, ..., N-1]
const indices = places.map((_, i) => i);
const { days, unscheduled } = scheduleTimes([indices], places, matrix, opts);
// days[0].dayNumber will be 1 (hardcoded in scheduleTimes as dayIdx+1)
// Relabel:
return {
  day: { dayNumber: mode.dayNumber, visits: days[0]?.visits ?? [] },
  unscheduled,
};
```

### `reorder=true` path (F2) — step-by-step

```typescript
// 1. Classify
const r = places.map((p, i) => ({ i, cat: classifyPlace(p.place_types) }));
const R = r.filter(x => x.cat === "restaurant").map(x => x.i); // restaurant indices
const A = r.filter(x => x.cat !== "restaurant").map(x => x.i); // snack+attraction indices

// 2. Build A-submatrix
const aMatrix = A.map(ai => A.map(aj => matrix[ai][aj]));

// 3. Order A with NN + 2-opt (if A.length > 1)
let aOrder: number[];
if (A.length === 0) {
  aOrder = [];
} else {
  const seed = nearestNeighbor(aMatrix);
  aOrder = twoOptImprove(seed, aMatrix);
}
// aOrder contains indices into A[] (i.e., indices into aMatrix), NOT into places[]
const orderedAFull = aOrder.map(i => A[i]); // now indices into places[]

// 4. Clock-walk orderedAFull; inject R at meal windows
// Walk using matrix times + visitDurations to simulate arrival times
// LUNCH_START=690 (11:30), LUNCH_END=810 (13:30), DINNER_START=1050, DINNER_END=1170
const finalOrder: number[] = [];
let currentTime = opts.dailyStartMinutes;
let lunchPlaced = false;
let dinnerPlaced = false;
let rPool = [...R]; // restaurants not yet placed

for (let k = 0; k < orderedAFull.length; k++) {
  const idx = orderedAFull[k];
  const travelFromPrev = k === 0 ? 0 : matrix[orderedAFull[k-1]][idx];
  const arrivalTime = currentTime + travelFromPrev;

  // Check lunch window: does the arrival fall in lunch window?
  if (!lunchPlaced && arrivalTime >= LUNCH_START && arrivalTime < LUNCH_END && rPool.length > 0) {
    // Insert nearest restaurant to current location
    const prev = finalOrder.length > 0 ? finalOrder[finalOrder.length - 1] : idx;
    const bestR = rPool.reduce((best, ri) => matrix[prev][ri] < matrix[prev][best] ? ri : best);
    finalOrder.push(bestR);
    rPool = rPool.filter(ri => ri !== bestR);
    lunchPlaced = true;
    currentTime = arrivalTime + places[bestR].visitDurationMinutes;
    // Re-add the attraction after the restaurant
    finalOrder.push(idx);
    currentTime += matrix[bestR][idx] + places[idx].visitDurationMinutes;
  } else if (!dinnerPlaced && arrivalTime >= DINNER_START && arrivalTime < DINNER_END && rPool.length > 0) {
    // same pattern for dinner
    ...
    dinnerPlaced = true;
  } else {
    finalOrder.push(idx);
    currentTime = arrivalTime + places[idx].visitDurationMinutes;
  }
}
// Append remaining rPool restaurants (>2 case: treat like attractions)
finalOrder.push(...rPool);

// 5. Call scheduleTimes with the merged order
const { days, unscheduled } = scheduleTimes([finalOrder], places, matrix, opts);
return {
  day: { dayNumber: mode.dayNumber, visits: days[0]?.visits ?? [] },
  unscheduled,
};
```

**NOTE:** The clock-walk above is a pre-scheduling simulation used to determine insertion points. It uses the same clock arithmetic as `scheduleTimes` but without opening-hours checks. Opening-hours correctness is guaranteed by the subsequent `scheduleTimes` call, which may push some places to `unscheduled`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-walk with hoursUnknown + opening hours | Custom time scheduler | `scheduleTimes` from `schedule.ts` | 200+ lines of correct pitfall handling already tested |
| Route ordering for A-set | Custom TSP | `nearestNeighbor` + `twoOptImprove` from `route.ts` | Already covers the N≤25 case; 2-opt is locally optimal |
| HH:MM string formatting | `String(h).padStart...` | `minutesToHHMM` from `schedule.ts` | Edge cases (midnight, 24h) already handled |
| DB load + 422 | New query pattern | Copy from `src/app/api/optimize/route.ts:78–99` | Pattern is locked and tested |
| Haversine distance | Custom math | Standard haversine formula (no library needed, it's 5 lines) | No library needed for N≤25; just implement inline |

---

## Common Pitfalls

### Pitfall 1: Matrix Index Misalignment in `day` Route
**What goes wrong:** `matrix[i][j]` for places `i` and `j` only if `coords[i]` aligns with `orderedRows[i]`. If `coords` is built from `rows` in DB query order instead of `placeIds` order, indices desync silently and travel times are wrong.
**Why it happens:** `db.select().from(places).where(inArray(...))` returns rows in an unspecified order.
**How to avoid:** Always build `orderedRows = placeIds.map(id => rowMap.get(id)!)` before building `coords`. This is exactly what `src/app/api/optimize/route.ts:120–127` does — copy verbatim.
**Warning sign:** Travel times look suspiciously uniform or zero.

### Pitfall 2: `getOpenWindow` is NOT Exported
**What goes wrong:** Trying to import `getOpenWindow` from `schedule.ts` to use in `scheduleSingleDay` directly fails — it's a private module-level function.
**How to avoid:** Call `scheduleTimes([[...indices]], places, matrix, opts)` to get the time-walk and opening-hours handling. Never duplicate the window logic.

### Pitfall 3: `ScheduleTimesOpts.travelDate` Is Required
**What goes wrong:** `ScheduleTimesOpts` has `travelDate: string` (not optional). If the request omits `travelDate`, the route must supply a default before calling `scheduleSingleDay`.
**How to avoid:** In the day route: `const travelDate = body.travelDate ?? nextMonday()`. Extract `nextMonday()` from `src/lib/optimizer/index.ts:46–56` into a shared util, OR inline it in the day route.

### Pitfall 4: `place_types` Absent for Newly Resolved Places
**What goes wrong:** F1 resolves a place via `POST /api/places/resolve`, which does NOT write `place_types`. If the user immediately clicks 「自動安排」 on that day (F2), the new place has `place_types = null` in the DB and will be classified as "attraction" (no meal slot).
**Why it happens:** The resolve route's upsert (route.ts:137–159) omits `place_types` intentionally — it only has the info from a Text Search result, not a Place Details response.
**How to avoid:** This is ACCEPTABLE per spec. Log it clearly in code. The spec says "Missing/null place_types → treated as 行程." No workaround needed; just document the behavior in a code comment.

### Pitfall 5: `replaceDay` Must Preserve `suggestedDays`
**What goes wrong:** If the client reassigns the whole `optimizeResult` instead of just swapping one day, `suggestedDays` is reset to the value returned by the day route response, which only returns `{ day, unscheduled }` — no `suggestedDays`.
**How to avoid:** `replaceDay` uses a functional state update that spreads the previous `optimizeResult` and only swaps the matching day. The `POST /api/optimize/day` route returns `{ day, unscheduled }` (not a full `OptimizeResult`).

### Pitfall 6: A-Submatrix Index Mapping in F2
**What goes wrong:** `nearestNeighbor(aMatrix)` returns indices 0..A.length-1 (positions within `aMatrix`), not indices into the full `places[]` array.
**How to avoid:** Always map back: `orderedAFull = nnResult.map(i => A[i])`. Then pass `orderedAFull` (full indices) to `scheduleTimes`.

### Pitfall 7: `city` Must Not Be Empty String in Resolve
**What goes wrong:** `resolveRequestSchema` uses `z.string().trim().min(1).optional()` for city. Sending `{ inputs: [...], city: "" }` fails Zod validation with 400.
**How to avoid:** In `DayPlaceAdder`, use `resolvedCity ? { inputs, city: resolvedCity } : { inputs }` — never send `city: ""`.

### Pitfall 8: `hoursUnknown` Path in F2
**What goes wrong:** During the clock-walk pre-simulation for F2, using `openingHours` to compute arrival times would break for `hoursUnknown=true` places.
**How to avoid:** The pre-simulation clock-walk should use ONLY `visitDurationMinutes` and `matrix[i][j]` (travel time). Opening-hours correctness is delegated entirely to the `scheduleTimes` call that follows.

### Pitfall 9: Empty Days from `scheduleTimes`
**What goes wrong:** If all places in the single-day call are closed on that day-of-week, `scheduleTimes` returns `{ days: [{ dayNumber:1, visits: [] }], unscheduled: [...] }`. The `day.visits` will be empty.
**How to avoid:** The client should handle `day.visits.length === 0` — show all places in `unscheduled` alongside an informative message. Never crash on an empty visits array.

---

## Code Examples

### Zod Schema for `POST /api/optimize/day` (new)

```typescript
// src/lib/validation/optimize-day.ts (new file)
import { z } from "zod";

export const optimizeDayRequestSchema = z.object({
  placeIds: z
    .array(z.string().min(1))
    .min(1)
    .max(25),
  reorder: z.boolean(),
  dayNumber: z.number().int().min(1).default(1),
  travelDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type OptimizeDayRequest = z.infer<typeof optimizeDayRequestSchema>;
```

### `classifyPlace` (new, pure)

```typescript
// src/lib/optimizer/day.ts
const RESTAURANT_TYPES = new Set(["restaurant", "food", "meal_takeaway", "meal_delivery"]);
const SNACK_TYPES = new Set(["cafe", "bakery", "dessert", "ice_cream_shop", "bar"]);

export function classifyPlace(
  placeTypes: string[] | null
): "restaurant" | "snack" | "attraction" {
  if (!placeTypes || placeTypes.length === 0) return "attraction";
  // restaurant wins if any type matches both sets
  if (placeTypes.some(t => RESTAURANT_TYPES.has(t))) return "restaurant";
  if (placeTypes.some(t => SNACK_TYPES.has(t))) return "snack";
  return "attraction";
}
```

### `pickClosestDay` (new, pure)

```typescript
// src/lib/places/closest-day.ts
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export interface DayWithCoords {
  dayNumber: number;
  visits: Array<{ lat: number; lng: number }>;
}

export function pickClosestDay(
  newPlace: { lat: number; lng: number },
  days: DayWithCoords[]
): number {  // returns dayNumber of the closest day
  let bestDay = days[0].dayNumber;
  let bestDist = Infinity;
  for (const day of days) {
    if (day.visits.length === 0) continue;
    const minDist = Math.min(
      ...day.visits.map(v => haversine(newPlace.lat, newPlace.lng, v.lat, v.lng))
    );
    if (minDist < bestDist) { bestDist = minDist; bestDay = day.dayNumber; }
  }
  return bestDay;
}
```

### `DayCard` header modification

```tsx
// src/components/day-card.tsx — CardHeader modification
interface DayCardProps {
  day: DayEntry;
  detailsById?: Map<string, PlaceDetail>;
  onDurationChange?: (placeId: string, minutes: number) => void;
  onAutoArrange?: (dayNumber: number) => void;  // NEW
}

// In CardHeader:
<div className="flex items-center justify-between">
  <h2 className="text-lg font-semibold text-foreground">第 {day.dayNumber} 天</h2>
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">共 {day.visits.length} 個地點</span>
    {onAutoArrange && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAutoArrange(day.dayNumber)}
      >
        自動安排
      </Button>
    )}
  </div>
</div>
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (environment: "node", globals: true) |
| Config file | `vitest.config.ts` (project root) |
| `@` alias | resolves to `./src` |
| Quick run | `npx vitest run src/lib/optimizer/day.test.ts` |
| Full suite | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | `classifyPlace` returns correct category for all inputs | unit | `npx vitest run src/lib/optimizer/day.test.ts` | Wave 0 |
| EDIT-01 | `scheduleSingleDay` reorder=false keeps given order | unit | same | Wave 0 |
| EDIT-01 | `pickClosestDay` picks nearest day | unit | `npx vitest run src/lib/places/closest-day.test.ts` | Wave 0 |
| EDIT-01 | `POST /api/optimize/day` Zod validation → 400 | route test | `npx vitest run src/app/api/optimize/day/route.test.ts` | Wave 0 |
| EDIT-01 | `POST /api/optimize/day` 422 for unresolved placeIds | route test | same | Wave 0 |
| EDIT-01 | `POST /api/optimize/day` reorder=false happy path → 200 | route test | same | Wave 0 |
| EDIT-02 | `scheduleSingleDay` reorder=true: attractions shortest-path | unit | `npx vitest run src/lib/optimizer/day.test.ts` | Wave 0 |
| EDIT-02 | `scheduleSingleDay` reorder=true: one restaurant → lunch slot | unit | same | Wave 0 |
| EDIT-02 | `scheduleSingleDay` reorder=true: two restaurants → lunch+dinner | unit | same | Wave 0 |
| EDIT-02 | `scheduleSingleDay` reorder=true: no restaurants → plain path | unit | same | Wave 0 |
| EDIT-02 | `POST /api/optimize/day` reorder=true happy path → 200 | route test | `npx vitest run src/app/api/optimize/day/route.test.ts` | Wave 0 |

### Sampling Rate

- Per task commit: `npx vitest run src/lib/optimizer/day.test.ts src/lib/places/closest-day.test.ts`
- Per wave merge: `npx vitest run`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps (all test files are new)

- [ ] `src/lib/optimizer/day.test.ts` — covers `classifyPlace` + `scheduleSingleDay`
- [ ] `src/lib/places/closest-day.test.ts` — covers `pickClosestDay`
- [ ] `src/app/api/optimize/day/route.test.ts` — covers `POST /api/optimize/day`

---

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod schema on `POST /api/optimize/day` body (mirrors existing pattern) |
| V4 Access Control | partial | `POST /api/optimize/day` is anonymous (same as existing optimize route — no auth gate per AUTH-01) |
| V6 Cryptography | no | No crypto in this phase |
| V2 Authentication | no | No new auth endpoints |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized placeIds array (DoS + cost) | DoS | `placeIds.max(25)` in Zod schema (same as existing route T-02-07) |
| API key leakage | Info Disclosure | `GOOGLE_PLACES_API_KEY` read only from `process.env` in route handler; never in response |
| SQL injection via placeIds | Tampering | `inArray(places.place_id, placeIds)` — Drizzle parameterizes; never raw SQL |
| Unlimited Routes API spend (F1+F2 each trigger computeRouteMatrix) | DoS / Cost | Capped at 25 placeIds; no additional mitigation beyond schema limit |

---

## Runtime State Inventory

Omitted — Phase 6 is not a rename/refactor/migration phase.

## Environment Availability

Phase 6 uses only the existing stack (Next.js, Google APIs, Supabase). No new external dependencies. Verified available from prior phases.

---

## State of the Art

No changes from existing patterns. This phase extends the existing optimizer architecture without introducing new external dependencies or changing API versions.

| Aspect | Current Approach | Phase 6 |
|--------|-----------------|---------|
| Google Routes API | `computeRouteMatrix` via `routes.googleapis.com` | Same — called once per `POST /api/optimize/day` |
| Scheduler | `scheduleTimes` multi-day | `scheduleSingleDay` wraps `scheduleTimes` for one day |
| DB pattern | `getDb()` cache() + maxUses:1 | Same pattern in new route |

---

## Assumptions Log

No `[ASSUMED]` claims in this research. All findings are sourced directly from the codebase.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**All claims in this research were verified from the actual source files.**

---

## Open Questions

1. **`durationOverrides` in the day route body?**
   - What we know: The existing `/api/optimize` route accepts `durationOverrides` (INPUT-05). The `POST /api/optimize/day` spec does NOT include it.
   - What's unclear: If a user had overridden visit durations before generating the itinerary, those overrides are held in `place-input-panel.tsx::durationOverrides` state. When F2 auto-arranges a day, those overrides are lost (the day route uses DB's `default_visit_duration_minutes`).
   - Recommendation: Omit `durationOverrides` from the day route for v1 (per spec). The planner should flag this as a known limitation in the phase's PLAN.md.

2. **`unscheduled` from day route — client display?**
   - What we know: `scheduleSingleDay` returns `{ day, unscheduled }`. If places are closed on that day, they appear in `unscheduled`.
   - What's unclear: The results page already has `UnscheduledAlert` (used by `ResultsLayout`) but it operates on the global `OptimizeResult.unscheduled`. There's no per-day unscheduled display.
   - Recommendation: For Phase 6, merge day-route `unscheduled` into the day's inline error display rather than the global `UnscheduledAlert`. Exact UX is Claude's discretion.

3. **Rate limiting for F1 resolve calls?**
   - What we know: `POST /api/places/resolve` has rate limiting (`checkAndCount`, `src/app/api/places/resolve/route.ts:57–73`). Each F1 add consumes 1 rate-limit count per call.
   - What's unclear: Whether the daily cap is sufficient given that users may make many F1 calls during editing.
   - Recommendation: No action needed for Phase 6 (existing rate-limit behavior applies). Flag for monitoring post-launch.

---

## Sources

### Primary (HIGH confidence — read from actual source files)

| File | What Was Verified |
|------|------------------|
| `src/lib/optimizer/types.ts` | `OptimizerPlace`, `TravelMatrix`, `OptimizerInput` exact types |
| `src/lib/optimizer/schedule.ts` | `scheduleTimes` signature, `ScheduleTimesOpts`, `ScheduledVisit`, `OptimizeResult`, `minutesToHHMM`, `getOpenWindow` (private, not exported) |
| `src/lib/optimizer/route.ts` | `nearestNeighbor`, `twoOptImprove`, `routeTravelTime` signatures and index contract |
| `src/lib/optimizer/index.ts` | `optimize()` orchestration, `nextMonday()` helper, defaults |
| `src/lib/google/routes-client.ts` | `computeRouteMatrix` full signature, matrix indexing, sentinel value for unreachable |
| `src/app/api/optimize/route.ts` | Full route handler: all 8 steps, DB mapping pattern, error codes |
| `src/app/api/optimize/route.test.ts` | Test patterns: mock setup for DB + computeRouteMatrix, `NextRequest` constructor, env stubbing |
| `src/app/api/places/resolve/route.ts` | Resolve flow, upsert columns (no `place_types`), rate limiting |
| `src/app/api/places/details/route.ts` | Details flow, `place_types` write path confirmed |
| `src/lib/validation/optimize.ts` | `optimizeRequestSchema` — Zod pattern to mirror |
| `src/lib/validation/resolve.ts` | `resolveRequestSchema`, `ResolvedPlace`, `ResolveResponse` types |
| `src/lib/db/schema.ts` | `places` table schema — `place_types text[]`, all columns |
| `src/lib/db/index.ts` | `getDb()` — `cache()` wrapper, `maxUses:1`, null-return contract |
| `src/components/place-input-panel.tsx` | State shape, all handlers, ResultsLayout call, `resolvedCity`/`startDate` availability |
| `src/components/results-layout.tsx` | `ResultsLayoutProps`, `buildDaysWithCoords`, prop threading |
| `src/components/itinerary-view.tsx` | `ItineraryViewProps`, DayCard loop, prop threading |
| `src/components/day-card.tsx` | `DayCardProps`, header structure (injection point for F2 button) |
| `src/types/itinerary.ts` | `OptimizeResult`, `ScheduledVisit`, `PlaceDetail`, `PlaceCoord`, `EnrichedVisit` re-exports |
| `src/lib/places/use-place-details.ts` | `usePlaceDetails` hook — `place_types` NOT in `PlaceDetail` type |
| `src/lib/places/duration-table.ts` | `durationForTypes` — fallback for missing `place_types` |
| `vitest.config.ts` | Test environment (node), globals, `@` alias, exclude patterns |

---

## Metadata

**Confidence breakdown:**
- Optimizer signatures: HIGH — read from source
- DB schema and place_types: HIGH — read from source
- Route handler pattern: HIGH — read from source
- Test conventions: HIGH — read from source and existing test file
- Results page state threading: HIGH — read from source

**Research date:** 2026-06-27
**Valid until:** 2026-09-27 (stable internal codebase; re-verify if schema.ts or schedule.ts changes)
