# Phase 6: Interactive Single-Day Editing — Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/optimizer/day.ts` | utility (pure optimizer module) | transform | `src/lib/optimizer/route.ts` + `src/lib/optimizer/schedule.ts` | exact |
| `src/lib/places/closest-day.ts` | utility (pure helper) | transform | none (haversine is new; pattern from route.ts purity) | role-match |
| `src/lib/validation/optimize-day.ts` | utility (Zod schema) | — | `src/lib/validation/optimize.ts` | exact |
| `src/app/api/optimize/day/route.ts` | route handler | request-response | `src/app/api/optimize/route.ts` | exact |
| `src/components/day-place-adder.tsx` | component (F1) | request-response | `src/components/place-input-panel.tsx` (fetch + loading/error pattern) | role-match |
| `src/lib/optimizer/day.test.ts` | test | — | `src/app/api/optimize/route.test.ts` (vitest conventions) | role-match |
| `src/lib/places/closest-day.test.ts` | test | — | `src/app/api/optimize/route.test.ts` (vitest conventions) | role-match |
| `src/app/api/optimize/day/route.test.ts` | test | — | `src/app/api/optimize/route.test.ts` | exact |
| `src/components/day-card.tsx` *(modify)* | component | — | itself (`src/components/day-card.tsx`) | exact |
| `src/components/place-input-panel.tsx` *(modify)* | component | — | itself | exact |
| `src/components/results-layout.tsx` *(modify)* | component | — | itself | exact |
| `src/components/itinerary-view.tsx` *(modify)* | component | — | itself | exact |

---

## Pattern Assignments

### `src/lib/optimizer/day.ts` (pure optimizer module, transform)

**Primary analog:** `src/lib/optimizer/route.ts`
**Secondary analog:** `src/lib/optimizer/schedule.ts`

**Why closest:** `route.ts` is the canonical example of a pure optimizer module in this project — zero I/O, typed with `TravelMatrix` from `types.ts`, exports named functions. `schedule.ts` provides `scheduleTimes` which `scheduleSingleDay` calls directly.

**Imports pattern** (`src/lib/optimizer/route.ts` lines 1–19 and `schedule.ts` lines 21–22):
```typescript
// route.ts: only imports the shared type — no Node, no fetch, no process.env
import type { TravelMatrix } from "./types";

// schedule.ts imports pattern for day.ts to mirror:
import type { OptimizerPlace, TravelMatrix } from "./types";
import { isOpenAt } from "./opening-hours";
// day.ts will instead import from sibling modules:
import type { OptimizerPlace, TravelMatrix } from "./types";
import { scheduleTimes, type ScheduleTimesOpts, type ScheduledVisit } from "./schedule";
import { nearestNeighbor, twoOptImprove } from "./route";
```

**Purity contract** (`src/lib/optimizer/route.ts` lines 1–17 — doc comment):
```
/**
 * These are PURE functions operating on integer indices and a TravelMatrix.
 * They have zero knowledge of places, opening hours, or any I/O — that
 * separation keeps them independently unit-testable with mock matrices.
 */
```
`day.ts` MUST carry an equivalent doc comment asserting "no HTTP, no DB, no process.env" — matching `schedule.ts` lines 1–8.

**Core pattern — `reorder=false` path** (derived from RESEARCH.md §scheduleSingleDay):
```typescript
// Keep given order; wrap in scheduleTimes with a single-element dayOrders array
const indices = places.map((_, i) => i);
const { days, unscheduled } = scheduleTimes([indices], places, matrix, opts);
// scheduleTimes hardcodes dayNumber = dayIdx + 1 (= 1 here); relabel:
return {
  day: { dayNumber: mode.dayNumber, visits: days[0]?.visits ?? [] },
  unscheduled,
};
```

**Core pattern — `reorder=true` submatrix extraction** (from RESEARCH.md §A-submatrix, citing route.ts lines 60–89 index contract):
```typescript
// Build A-submatrix (snack+attraction indices only)
const aMatrix = A.map(ai => A.map(aj => matrix[ai][aj]));
// Run NN + 2-opt on the submatrix (same call signature as route.ts exports)
const seed = nearestNeighbor(aMatrix);           // returns indices 0..A.length-1
const aOrder = twoOptImprove(seed, aMatrix);     // same index space
// Map back to full places[] indices (CRITICAL — Pitfall 6)
const orderedAFull = aOrder.map(i => A[i]);
```

**`classifyPlace` helper** (from RESEARCH.md §classifyPlace):
```typescript
const RESTAURANT_TYPES = new Set(["restaurant", "food", "meal_takeaway", "meal_delivery"]);
const SNACK_TYPES = new Set(["cafe", "bakery", "dessert", "ice_cream_shop", "bar"]);

export function classifyPlace(
  placeTypes: string[] | null
): "restaurant" | "snack" | "attraction" {
  if (!placeTypes || placeTypes.length === 0) return "attraction";
  if (placeTypes.some(t => RESTAURANT_TYPES.has(t))) return "restaurant"; // restaurant wins
  if (placeTypes.some(t => SNACK_TYPES.has(t))) return "snack";
  return "attraction";
}
```

**Key constraint:** `getOpenWindow` is NOT exported from `schedule.ts` (RESEARCH.md Pitfall 2). Never attempt to import it. All opening-hours logic is delegated to `scheduleTimes`.

---

### `src/lib/places/closest-day.ts` (pure utility, transform)

**Analog:** No existing haversine/distance helper exists in the codebase. Pattern the file structure after `src/lib/optimizer/route.ts` (pure module, named exports, no I/O).

**Purity model from `route.ts` lines 1–17:** same "zero I/O, independently unit-testable" contract.

**Full implementation** (from RESEARCH.md §pickClosestDay — no codebase analog to copy from):
```typescript
// src/lib/places/closest-day.ts
// PURE — no HTTP, no DB, no process.env.

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface DayWithCoords {
  dayNumber: number;
  visits: Array<{ lat: number; lng: number }>;
}

export function pickClosestDay(
  newPlace: { lat: number; lng: number },
  days: DayWithCoords[]
): number {
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

---

### `src/lib/validation/optimize-day.ts` (Zod schema)

**Analog:** `src/lib/validation/optimize.ts`
**Why closest:** Identical role — Zod schema file for a POST route request body, same `placeIds` array shape, same security comments.

**Imports pattern** (`src/lib/validation/optimize.ts` lines 1–1):
```typescript
import { z } from "zod";
```

**`placeIds` field pattern** (lines 21–24 of `optimize.ts`):
```typescript
placeIds: z
  .array(z.string().min(1, "Each placeId must be a non-empty string"))
  .min(1, "At least one placeId is required")
  .max(25, "Maximum 25 placeIds per request (Routes API 625-element cap)"),
```

**`travelDate` field pattern** (lines 44–49):
```typescript
travelDate: z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "travelDate must be an ISO date string in YYYY-MM-DD format"
  )
  .optional(),
```

**New fields for `optimize-day.ts`** (from RESEARCH.md §Zod Schema):
```typescript
reorder: z.boolean(),
dayNumber: z.number().int().min(1).default(1),
// travelDate: same as optimize.ts above
// durationOverrides: OMIT (not in spec body)
```

**Error response type pattern** (lines 67–70 of `optimize.ts`):
```typescript
export interface OptimizeDayErrorResponse {
  error: string;
  details?: unknown;
}
```

---

### `src/app/api/optimize/day/route.ts` (POST route handler, request-response)

**Analog:** `src/app/api/optimize/route.ts`
**Why closest:** Identical role and data flow. Same 8-step pattern: JSON parse → Zod validate → getDb() guard → DB load → 422 unresolved → API key guard → computeRouteMatrix → pure function → return. RESEARCH.md confirmed this is a near-verbatim copy with `scheduleSingleDay` substituted for `optimize`.

**Imports pattern** (lines 1–13 of `src/app/api/optimize/route.ts`):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { computeRouteMatrix, type RouteMatrixCoord } from "@/lib/google/routes-client";
// Replace: import { optimize } from "@/lib/optimizer";
import { scheduleSingleDay } from "@/lib/optimizer/day";
import type { OptimizerPlace } from "@/lib/optimizer/types";
import type { OpeningHoursPeriod } from "@/lib/google/places-client";
import { durationForTypes } from "@/lib/places/duration-table";
import {
  optimizeDayRequestSchema,
  type OptimizeDayErrorResponse,
} from "@/lib/validation/optimize-day";
```

**Step 1 — JSON parse guard** (lines 46–51):
```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  const error: OptimizeDayErrorResponse = { error: "Invalid JSON in request body" };
  return NextResponse.json(error, { status: 400 });
}
```

**Step 2 — Zod validation** (lines 54–61):
```typescript
const parsed = optimizeDayRequestSchema.safeParse(body);
if (!parsed.success) {
  const error: OptimizeDayErrorResponse = {
    error: "Validation failed",
    details: parsed.error.flatten(),
  };
  return NextResponse.json(error, { status: 400 });
}
const { placeIds, reorder, dayNumber, travelDate } = parsed.data;
```

**Step 3 — getDb() null guard** (lines 67–73):
```typescript
const db = getDb();
if (!db) {
  const error: OptimizeDayErrorResponse = {
    error: "Server configuration error: database is not configured",
  };
  return NextResponse.json(error, { status: 500 });
}
```

**Steps 4–5 — DB load + 422** (lines 78–99 — copy verbatim):
```typescript
const rows = await db
  .select()
  .from(places)
  .where(inArray(places.place_id, placeIds));

const foundIds = new Set(rows.map((r) => r.place_id));
const missingIds = placeIds.filter((id) => !foundIds.has(id));
if (missingIds.length > 0) {
  const error: OptimizeDayErrorResponse = {
    error: "Unresolved placeIds — resolve them via GET /api/places/details first",
    details: missingIds,
  };
  return NextResponse.json(error, { status: 422 });
}
```

**Steps 6–7 — ordered rows + matrix + coords** (lines 104–137 — copy verbatim; CRITICAL for Pitfall 1):
```typescript
const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  return NextResponse.json(
    { error: "Server configuration error: GOOGLE_PLACES_API_KEY is not set" },
    { status: 500 }
  );
}
// CRITICAL: build coords in placeIds order (not DB query order) — Pitfall 1
const rowMap = new Map(rows.map((r) => [r.place_id, r]));
const orderedRows = placeIds.map((id) => rowMap.get(id)!);
const coords: RouteMatrixCoord[] = orderedRows.map((row) => ({ lat: row.lat, lng: row.lng }));

let matrix: number[][];
try {
  matrix = await computeRouteMatrix(coords, apiKey);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: `Routes API error: ${message}` }, { status: 502 });
}
```

**Step 8 — OptimizerPlace mapping** (lines 152–174 — copy verbatim; omit `durationOverrides`):
```typescript
const optimizerPlaces: OptimizerPlace[] = orderedRows.map((row) => {
  const visitDurationMinutes =
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

**Step 9 — call scheduleSingleDay + travelDate default** (new, from RESEARCH.md Pitfall 3):
```typescript
// travelDate is REQUIRED by ScheduleTimesOpts — supply default if omitted
const effectiveTravelDate = travelDate ?? nextMonday(); // extract nextMonday from src/lib/optimizer/index.ts:46-56

const { day, unscheduled } = scheduleSingleDay(
  optimizerPlaces,
  matrix,
  { dailyStartMinutes: 540, dailyEndMinutes: 1260, travelDate: effectiveTravelDate },
  { reorder, dayNumber }
);
return NextResponse.json({ day, unscheduled });
// NOTE: returns { day, unscheduled } NOT a full OptimizeResult — no suggestedDays (Pitfall 5)
```

---

### `src/components/day-place-adder.tsx` (F1 component, request-response)

**Analog:** `src/components/place-input-panel.tsx`
**Why closest:** Same pattern — "use client", shadcn/ui Button + Input, loading state tri-value, inline Alert error, async fetch with try/catch, city-conditional body (Pitfall 7). The resolve call in `handleResolve` (place-input-panel.tsx lines 76–120) is the direct model.

**Imports pattern** (place-input-panel.tsx lines 1–17):
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
// day-place-adder adds:
import { Loader2 } from "lucide-react";
import { pickClosestDay } from "@/lib/places/closest-day";
import type { ResolvedPlace } from "@/lib/validation/resolve";
import type { OptimizeResult, ScheduledVisit } from "@/types/itinerary";
```

**Fetch + loading/error state pattern** (place-input-panel.tsx lines 44, 90–96):
```typescript
// Mirror the tri-state loading pattern from place-input-panel
const [loading, setLoading] = useState<"idle" | "resolving" | "submitting">("idle");
const [error, setError] = useState<string | null>(null);

// City-conditional body — NEVER send city: "" (Pitfall 7)
const resolveBody = resolvedCity
  ? { inputs: [inputValue], city: resolvedCity }
  : { inputs: [inputValue] };
const response = await fetch("/api/places/resolve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(resolveBody),
});
```

**Inline error display pattern** (place-input-panel.tsx lines 105–108):
```typescript
if (!response.ok) {
  setError(data.error ?? "加入地點失敗，請稍後再試");
  return;
}
```

**NOT_FOUND check pattern** (place-input-panel.tsx lines 111–119):
```typescript
// Check first item for NOT_FOUND
const firstItem = data.places?.[0];
if (!firstItem || "status" in firstItem) {
  setError("找不到這個地點");
  return;
}
// firstItem is ResolvedPlace — continue to pickClosestDay + day API call
```

**Button disabled + loading state** (place-input-panel.tsx line 44 pattern, UI-SPEC §3):
```tsx
<Button
  onClick={handleAdd}
  disabled={!inputValue.trim() || loading !== "idle"}
  aria-busy={loading !== "idle"}
>
  {loading !== "idle" ? (
    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />加入中...</>
  ) : "加入行程"}
</Button>
```

**Alert for errors** (shadcn pattern, consistent with existing Alert usage in place-input-panel):
```tsx
{error && (
  <Alert variant="destructive" role="alert">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

---

### `src/components/day-card.tsx` *(modify — add F2 button)*

**Analog:** itself (`src/components/day-card.tsx`)

**Current header** (day-card.tsx lines 33–44):
```tsx
<Card className="bg-white border border-gray-200 shadow-sm">
  <CardHeader className="pb-2">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-foreground">
        第 {day.dayNumber} 天
      </h2>
      <span className="text-sm text-muted-foreground">
        共 {day.visits.length} 個地點
      </span>
    </div>
  </CardHeader>
```

**Modification — add `onAutoArrange` prop + button** (UI-SPEC §3 F2 contract):
```tsx
// New prop in DayCardProps (lines 10–16 — extend interface):
onAutoArrange?: (dayNumber: number) => void;  // F2

// Replace the <span> with a flex group in CardHeader:
<div className="flex items-center gap-2">
  <span className="text-sm text-muted-foreground">
    共 {day.visits.length} 個地點
  </span>
  {onAutoArrange && (
    <Button
      variant="outline"
      size="sm"
      className="h-11"           // 44px touch target (DISP-04)
      aria-label={`自動安排第 ${day.dayNumber} 天`}
      onClick={() => onAutoArrange(day.dayNumber)}
    >
      自動安排
    </Button>
  )}
</div>
```

Per-day loading and error state (isArranging, arrangeError) should be local to `DayCard` rather than lifted, since only one day is affected at a time. The component needs `useState` and `"use client"` added if not already present (currently it has no state — it is a pure render component).

---

### `src/components/place-input-panel.tsx` *(modify — add `replaceDay`, render DayPlaceAdder, thread `onAutoArrange`)*

**Analog:** itself

**`replaceDay` updater** (RESEARCH.md §replaceDay — new handler to add after existing handlers):
```typescript
// Add after handleDurationChange (preserves suggestedDays — Pitfall 5)
function replaceDay(
  dayNumber: number,
  newDay: { dayNumber: number; visits: ScheduledVisit[] }
) {
  setOptimizeResult(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      days: prev.days.map(d => d.dayNumber === dayNumber ? newDay : d),
    };
  });
}
```

**`onAutoArrange` handler** (call POST /api/optimize/day, pattern mirrors handleOptimize in place-input-panel):
```typescript
async function handleAutoArrange(dayNumber: number) {
  if (!optimizeResult) return;
  const thatDay = optimizeResult.days.find(d => d.dayNumber === dayNumber);
  if (!thatDay) return;
  const placeIds = thatDay.visits.map(v => v.placeId);
  const body = {
    placeIds,
    reorder: true,
    dayNumber,
    ...(startDate ? { travelDate: startDate } : {}),
  };
  const res = await fetch("/api/optimize/day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return; // DayCard handles its own error display
  const { day } = await res.json() as { day: { dayNumber: number; visits: ScheduledVisit[] }; unscheduled: unknown[] };
  replaceDay(dayNumber, day);
}
```

**ResultsLayout call site** (extend the existing JSX in place-input-panel where `<ResultsLayout ... />` is rendered — pass new props):
```tsx
<ResultsLayout
  itinerary={optimizeResult}
  resolvedPlaces={resolvedPlaces}
  detailsById={detailsById}
  onDurationChange={handleDurationChange}
  onAutoArrange={handleAutoArrange}   {/* NEW */}
  replaceDay={replaceDay}             {/* NEW — for DayPlaceAdder */}
  resolvedCity={resolvedCity}         {/* NEW */}
  startDate={startDate}               {/* NEW */}
  setResolvedPlaces={setResolvedPlaces} {/* NEW */}
/>
```

---

### `src/lib/optimizer/day.test.ts` (unit tests)

**Analog:** `src/app/api/optimize/route.test.ts`
**Why closest:** Same vitest conventions — `describe`/`it`/`expect`, `vi.fn()`, no real I/O. For pure functions the pattern simplifies: no mocks needed, just construct test inputs directly.

**Vitest conventions** (route.test.ts lines 21–22):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// For pure unit tests (day.ts has no I/O): only import describe/it/expect
import { describe, it, expect } from "vitest";
import { classifyPlace, scheduleSingleDay } from "@/lib/optimizer/day";
import type { OptimizerPlace } from "@/lib/optimizer/types";
```

**Minimal `OptimizerPlace` fixture** (route.test.ts `makePlaceRow` pattern adapted):
```typescript
function makePlace(overrides: Partial<OptimizerPlace> = {}): OptimizerPlace {
  return {
    placeId: "ChIJtest",
    displayName: "Test",
    lat: 25.0,
    lng: 121.5,
    openingHours: null,
    utcOffsetMinutes: 480,
    visitDurationMinutes: 60,
    hoursUnknown: true,   // avoids opening-hours checks in tests
    ...overrides,
  };
}
```

**Identity matrix helper** (route.test.ts `makeMatrix` lines 103–107):
```typescript
function makeMatrix(n: number, offDiagonal = 15): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : offDiagonal))
  );
}
```

**Minimal `ScheduleTimesOpts` for tests:**
```typescript
const TEST_OPTS = {
  dailyStartMinutes: 540,
  dailyEndMinutes: 1260,
  travelDate: "2026-07-07",   // Monday — all days open
};
```

**Test structure** (from RESEARCH.md §Phase Requirements → Test Map):
```typescript
describe("classifyPlace", () => {
  it("returns 'restaurant' for restaurant type", ...);
  it("returns 'snack' for cafe type", ...);
  it("returns 'attraction' for null place_types", ...);
  it("restaurant wins when both restaurant and snack types present", ...);
});

describe("scheduleSingleDay — reorder=false", () => {
  it("keeps given order", ...);
  it("assigns times starting from dailyStartMinutes", ...);
});

describe("scheduleSingleDay — reorder=true", () => {
  it("plain shortest-path when no restaurants", ...);
  it("inserts one restaurant in lunch window", ...);
  it("inserts two restaurants in lunch and dinner windows", ...);
  it("extra restaurants placed in route order (>2 case)", ...);
});
```

---

### `src/lib/places/closest-day.test.ts` (unit tests)

**Analog:** `src/app/api/optimize/route.test.ts` (vitest conventions)

**Import pattern:**
```typescript
import { describe, it, expect } from "vitest";
import { pickClosestDay, type DayWithCoords } from "@/lib/places/closest-day";
```

**Test structure** (from RESEARCH.md §Phase Requirements → Test Map):
```typescript
describe("pickClosestDay", () => {
  it("picks the day whose places are nearest to the new place", ...);
  it("handles single-day itinerary (always returns day 1)", ...);
  it("skips days with empty visits array", ...);
  // tie case: picks whichever comes first when distances are equal
});
```

---

### `src/app/api/optimize/day/route.test.ts` (route handler tests)

**Analog:** `src/app/api/optimize/route.test.ts` — copy the entire scaffolding verbatim.

**Mock declarations** (route.test.ts lines 29–43 — copy and change import path):
```typescript
vi.mock("@/lib/db", () => {
  const dbMock = { select: vi.fn() };
  return { getDb: () => dbMock };
});

vi.mock("@/lib/google/routes-client", () => ({
  computeRouteMatrix: vi.fn(),
}));

// Also mock scheduleSingleDay (unlike optimize(), we want to isolate the route)
vi.mock("@/lib/optimizer/day", () => ({
  scheduleSingleDay: vi.fn(),
}));

import { POST } from "./route";
import { getDb } from "@/lib/db";
import { computeRouteMatrix } from "@/lib/google/routes-client";
import { scheduleSingleDay } from "@/lib/optimizer/day";
```

**`makePlaceRow` helper** (route.test.ts lines 60–89 — copy verbatim including `place_types`):
```typescript
function makePlaceRow(overrides: Partial<{...}> = {}) {
  return {
    // ...same as optimize/route.test.ts...
    place_types: ["tourist_attraction"],
    ...overrides,
  };
}
```

**`mockDbReturn` helper** (route.test.ts lines 95–100 — copy verbatim):
```typescript
function mockDbReturn(rows: ReturnType<typeof makePlaceRow>[]) {
  const whereMock = vi.fn().mockResolvedValue(rows);
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  vi.mocked(db!.select).mockReturnValue({ from: fromMock } as ...);
}
```

**`makeRequest` helper** (route.test.ts lines 51–57 — adapt URL):
```typescript
function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/optimize/day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

**env setup/teardown** (route.test.ts lines 113–124 — copy verbatim):
```typescript
const ORIGINAL_ENV = process.env.GOOGLE_PLACES_API_KEY;
beforeEach(() => { vi.clearAllMocks(); process.env.GOOGLE_PLACES_API_KEY = "test-api-key"; });
afterEach(() => { process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_ENV; vi.restoreAllMocks(); });
```

**Test cases** (from RESEARCH.md §Phase Requirements → Test Map):
```typescript
// Validation (400): missing placeIds, reorder missing, placeIds > 25, bad JSON
// Unresolved (422): one placeId missing from DB — computeRouteMatrix NOT called
// Config error (500): missing GOOGLE_PLACES_API_KEY
// Happy path reorder=false (200): scheduleSingleDay called with {reorder:false, dayNumber}
// Happy path reorder=true (200): scheduleSingleDay called with {reorder:true, dayNumber}
// 502: computeRouteMatrix throws
```

---

## Shared Patterns

### Purity Contract (apply to `day.ts` and `closest-day.ts`)
**Source:** `src/lib/optimizer/route.ts` lines 1–17 (doc comment) and `src/lib/optimizer/schedule.ts` lines 1–8
- No `fetch`, `import fs`, `process.env`, or DB calls in any `src/lib/optimizer/*.ts` or `src/lib/places/closest-day.ts` file.
- All inputs are function parameters; all outputs are return values.
- Functions must be independently unit-testable with pure in-memory data.

### Route Handler 8-Step Skeleton (apply to `day/route.ts`)
**Source:** `src/app/api/optimize/route.ts` lines 42–190
1. JSON parse → 400
2. Zod safeParse → 400
3. getDb() null → 500
4. DB inArray load
5. Missing IDs → 422
6. API key env → 500
7. orderedRows (placeIds order!) + computeRouteMatrix → 502 on throw
8. OptimizerPlace mapping → call pure function → NextResponse.json

### DB Row → OptimizerPlace Mapping (apply to `day/route.ts`)
**Source:** `src/app/api/optimize/route.ts` lines 152–174 (quoted above in Pattern Assignments)
- Omit `durationOverrides` in the day route (not in spec).
- `place_types` is `string[] | null` from `schema.ts:43` — pass as `row.place_types ?? []` to `durationForTypes`.

### Ordered Rows / Matrix Alignment (apply to `day/route.ts`)
**Source:** `src/app/api/optimize/route.ts` lines 119–127
- Always `rowMap = new Map(rows.map(r => [r.place_id, r]))` then `orderedRows = placeIds.map(id => rowMap.get(id)!)`.
- Build `coords` from `orderedRows` — never from `rows` directly (Pitfall 1).

### Zod Schema Convention (apply to `optimize-day.ts`)
**Source:** `src/lib/validation/optimize.ts`
- Export both the schema and an inferred type (`export type X = z.infer<typeof schema>`).
- Export the error response interface in the same file.
- Security comments referencing threat model IDs (T-0X-XX) are project convention.

### Client Fetch + Loading/Error Pattern (apply to `DayPlaceAdder`)
**Source:** `src/components/place-input-panel.tsx` lines 44, 76–120
- Tri-state loading: `"idle" | "resolving" | "submitting"` (adapt labels per feature).
- `setError(null)` at start of each handler.
- Error branch returns early; never wipes existing state on failure.
- City-conditional body: `resolvedCity ? { inputs, city: resolvedCity } : { inputs }` (Pitfall 7).

### Vitest Test Conventions (apply to all three test files)
**Source:** `src/app/api/optimize/route.test.ts` lines 21–57
- `vi.mock` declarations before imports (hoisted).
- `makeRequest()` + `makePlaceRow()` + `mockDbReturn()` + `makeMatrix()` helpers.
- `beforeEach(() => vi.clearAllMocks())` + `afterEach(vi.restoreAllMocks)`.
- `vi.stubEnv` pattern via direct `process.env.X = ...` + restore in afterEach.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/places/closest-day.ts` | pure utility | transform | No haversine or geographic distance helper exists anywhere in the codebase. File structure and purity contract are modeled after `route.ts`; implementation is new. |

---

## Metadata

**Analog search scope:** `src/lib/optimizer/`, `src/lib/validation/`, `src/app/api/optimize/`, `src/components/`, `src/lib/places/`
**Files read:** `route.ts`, `schedule.ts` (header), `types.ts` (via RESEARCH.md), `src/app/api/optimize/route.ts`, `src/app/api/optimize/route.test.ts`, `src/lib/validation/optimize.ts`, `src/components/place-input-panel.tsx` (first 120 lines), `src/components/day-card.tsx`
**Pattern extraction date:** 2026-06-27
