---
phase: 06-interactive-day-editing
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/lib/optimizer/day.ts
  - src/lib/optimizer/types.ts
  - src/lib/places/closest-day.ts
  - src/lib/validation/optimize-day.ts
  - src/app/api/optimize/day/route.ts
  - src/components/day-place-adder.tsx
  - src/components/place-input-panel.tsx
  - src/components/results-layout.tsx
  - src/components/itinerary-view.tsx
  - src/components/day-card.tsx
  - src/lib/optimizer/day.test.ts
  - src/lib/places/closest-day.test.ts
  - src/app/api/optimize/day/route.test.ts
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-27
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 6 implements two interactive day-editing features: F1 (add-a-place to the closest day) and F2 (per-day auto-arrange with meal-slotting). The core optimizer logic (`day.ts`, `closest-day.ts`) and route handler (`route.ts`) are structurally sound — purity boundaries are respected, index alignment is correct, and the DB access pattern uses `getDb()` per-request as required.

Two critical bugs affect end-user data integrity: the `unscheduled` payload from `/api/optimize/day` is silently discarded in both the F1 client (`DayPlaceAdder`) and the F2 client (`handleAutoArrange`). When a newly-added or rearranged place fails to schedule (e.g., closed on that day), it disappears from the itinerary with no user notification and no way for the user to recover it — this violates the spec's "NEVER wipe itinerary on failure" spirit while technically not wiping, but still losing data.

The optimizer's clock-walk time-advancement computation in `day.ts` contains a logic error that is masked by the uniform travel-time matrices used in all tests; it would produce incorrect dinner-window placement with real-world asymmetric route matrices. The route handler and Zod schema both omit a placeIds uniqueness check, enabling silent double-scheduling via duplicate IDs. Several smaller robustness and quality issues are also noted.

---

## Critical Issues

### CR-01: F1 `unscheduled` response silently dropped — newly added place disappears

**File:** `src/components/day-place-adder.tsx:177-185`
**Issue:** After a successful `/api/optimize/day` response, `unscheduled` is destructured but never accessed. If the newly-added place fails to schedule (closed on the travel day, day end overflow, etc.), the API returns it in `unscheduled` with an empty `visits` entry. `replaceDay` then updates the day without the new place, `setInputValue("")` clears the field, `setLoading(false)` hides the spinner — the user receives zero feedback that anything went wrong. The "error handling contract" note in the code prevents wiping the *other* days but does not protect against silently losing the very place the user just added.

```tsx
// CURRENT — unscheduled dropped:
const { day } = (await dayRes.json()) as {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
};
replaceDay(dayNumber, day);
setResolvedPlaces((prev) => [...prev, newPlace]);
setInputValue("");

// FIX — surface any unscheduled items:
const { day, unscheduled } = (await dayRes.json()) as {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
};
if (unscheduled.some((u) => u.placeId === newPlace.placeId)) {
  // The new place was rejected (e.g., closed). Keep itinerary intact; tell user.
  const reason = unscheduled.find((u) => u.placeId === newPlace.placeId)?.reason ?? "";
  setError(`「${newPlace.displayName}」在該天無法安排（${reason}）`);
  return; // do NOT call replaceDay or setInputValue
}
replaceDay(dayNumber, day);
setResolvedPlaces((prev) => [...prev, newPlace]);
setInputValue("");
```

---

### CR-02: F2 `unscheduled` response silently dropped — places lost during auto-arrange

**File:** `src/components/place-input-panel.tsx:232-237`
**Issue:** `handleAutoArrange` discards the `unscheduled` array from the day-route response. When the user clicks "自動安排", any place that `scheduleTimes` rejects (closed on that day, day-end overflow after reordering) is silently removed from the day. `replaceDay` is called with the pruned `visits`, the visit count in the header decreases, and the user receives no explanation. The new count is visible but the reason for the change is not.

```tsx
// CURRENT — unscheduled dropped:
const { day } = (await res.json()) as {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
};
replaceDay(dayNumber, day);

// FIX — throw (or otherwise surface) when places are lost:
const { day, unscheduled } = (await res.json()) as {
  day: { dayNumber: number; visits: ScheduledVisit[] };
  unscheduled: Array<{ placeId: string; reason: string }>;
};
replaceDay(dayNumber, day);
// Surface dropped places; DayCard's catch will show the message string.
if (unscheduled.length > 0) {
  const names = unscheduled.map((u) => u.placeId).join(", ");
  throw new Error(`自動安排完成，但以下地點無法排入當天：${names}`);
}
```

---

## Warnings

### WR-01: Clock-walk `currentTime` advancement uses wrong travel leg for restaurant insertion

**File:** `src/lib/optimizer/day.ts:207-213` (identical pattern at `229-233`)
**Issue:** When a restaurant is inserted at the lunch or dinner window, `currentTime` is advanced using `arrivalTime` (= `currentTime + matrix[prevAStop][currentAStop]`) rather than `currentTime + matrix[prev][bestR]`. The variable `prev` (the last-pushed finalOrder element) and `bestR` (the nearest restaurant to `prev`) are correctly identified, but the first travel leg is taken from the wrong pair. In the uniform 90-minute matrices used in all tests, `matrix[prev][idx] === matrix[prev][bestR]`, so the error cancels out and all tests pass. With real-world Google Routes API matrices this discrepancy can be tens of minutes, causing the dinner window check (line 218: `arrivalTime >= DINNER_START`) to fire too early or too late in subsequent iterations.

```ts
// CURRENT (lunch branch, lines 207-213):
currentTime =
  arrivalTime +                          // ← uses matrix[prev][idx], not matrix[prev][bestR]
  places[bestR].visitDurationMinutes +
  matrix[bestR][idx] +
  places[idx].visitDurationMinutes;

// FIX — advance from currentTime through the actual restaurant leg:
currentTime =
  currentTime +
  matrix[prev][bestR] +                  // travel from last scheduled place → restaurant
  places[bestR].visitDurationMinutes +
  matrix[bestR][idx] +                   // travel from restaurant → current A-stop
  places[idx].visitDurationMinutes;
```

Apply the same fix to the dinner branch at lines 229-233.

---

### WR-02: `pickClosestDay` crashes with TypeError when called with an empty `days` array

**File:** `src/lib/places/closest-day.ts:60`
**Issue:** `days[0].dayNumber` is accessed unconditionally on the first line. If `days` is an empty array, this throws `TypeError: Cannot read properties of undefined`. The existing call site in `day-place-adder.tsx` derives `daysWithCoords` from `optimizeResult.days`, which is non-empty in normal use, but no runtime guard or TypeScript constraint enforces this. The test suite does not cover the empty-array case.

```ts
// CURRENT:
let bestDay = days[0].dayNumber;  // ← crash if days.length === 0

// FIX — add guard:
if (days.length === 0) throw new Error("pickClosestDay: days must be non-empty");
let bestDay = days[0].dayNumber;
```

---

### WR-03: Duplicate `placeIds` not rejected — same place scheduled twice

**File:** `src/lib/validation/optimize-day.ts:24-27` and `src/app/api/optimize/day/route.ts:125-126`
**Issue:** The Zod schema allows repeated placeId strings. The route handler builds `rowMap` keyed by `place_id` (deduplicates DB rows) and then maps `placeIds.map(id => rowMap.get(id)!)`, producing two identical entries in `orderedRows` for a duplicate ID. This creates identical coordinate pairs in `coords`, which `computeRouteMatrix` receives, and produces an `(N+1)×(N+1)` matrix with two identical rows/columns. `scheduleSingleDay` then schedules the same place twice, resulting in duplicate `visits` entries in the response. A user could trigger this accidentally if `DayPlaceAdder` appends an ID already in the day (see WR-04).

```ts
// FIX — add .refine() to schema:
placeIds: z
  .array(z.string().min(1))
  .min(1)
  .max(25)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "placeIds must be unique — duplicate IDs are not allowed"
  ),
```

---

### WR-04: `DayPlaceAdder` sends duplicate placeIds without deduplication check

**File:** `src/components/day-place-adder.tsx:146-147`
**Issue:** When building the placeIds list for the API call, the new place is appended directly to `existingPlaceIds` with no check for whether `newPlace.placeId` already appears in that day's visits. A user who pastes the same place name twice (or resolves a place already on that day) would trigger the duplicate-scheduling bug described in WR-03. Even if the server-side schema is hardened (WR-03 fix), the client should guard here.

```ts
// CURRENT:
const placeIds = [...existingPlaceIds, newPlace.placeId];

// FIX — reject duplicate before making the API call:
if (existingPlaceIds.includes(newPlace.placeId)) {
  setError("這個地點已在當天行程中");
  return;
}
const placeIds = [...existingPlaceIds, newPlace.placeId];
```

Additionally, `setResolvedPlaces((prev) => [...prev, newPlace])` on line 184 should guard against duplicates in the coord-map state:
```ts
setResolvedPlaces((prev) =>
  prev.some((p) => p.placeId === newPlace.placeId) ? prev : [...prev, newPlace]
);
```

---

### WR-05: DB query in route handler has no try-catch — non-conforming error response on DB failure

**File:** `src/app/api/optimize/day/route.ts:84-87`
**Issue:** The Drizzle `await db.select().from(places).where(inArray(...))` call has no surrounding try-catch. If the Hyperdrive connection is unavailable or the query times out, the error propagates as an unhandled rejection. Next.js App Router converts this to a generic 500 response whose body does not follow `OptimizeDayErrorResponse` format, breaking the client's typed error-handling code.

```ts
// FIX — wrap DB query:
let rows: typeof result;
try {
  rows = await db.select().from(places).where(inArray(places.place_id, placeIds));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    { error: `Database error: ${message}` } satisfies OptimizeDayErrorResponse,
    { status: 500 }
  );
}
```

---

### WR-06: `handleAdd` in `DayPlaceAdder` has no outer catch — intermediate errors leave UI in a silent broken state

**File:** `src/components/day-place-adder.tsx:83-188`
**Issue:** The outer `try { ... } finally { setLoading(false) }` block wraps all fetch calls and inner try-catches, but has no `catch` clause. If intermediate code between the inner try-catches throws — for example, `resolveData.places?.[0]` being accessed when `resolveData` is not the expected shape, or `pickClosestDay` throwing on an empty `daysWithCoords` — the error propagates from `handleAdd` as an unhandled promise rejection (the call site uses `void handleAdd()`). `setLoading(false)` runs correctly (finally clause), but `setError` is never called, leaving the spinner hidden and the input cleared with no visible error.

```ts
// FIX — add a catch clause to the outer try:
try {
  // ... all fetch and processing logic
} catch {
  setError("加入地點失敗，請稍後再試");
} finally {
  setLoading(false);
}
```

---

## Info

### IN-01: `nextMonday()` inlined instead of imported — DRY violation

**File:** `src/app/api/optimize/day/route.ts:182-191`
**Issue:** The comment explicitly acknowledges this is a copy of the function at `src/lib/optimizer/index.ts:45-55`. If the algorithm changes in the original, this copy will silently diverge. The function should be exported from its canonical location and imported here.

**Fix:** Export `nextMonday` from `src/lib/optimizer/index.ts` and replace the inline copy with `import { nextMonday } from "@/lib/optimizer"`.

---

### IN-02: `|| 7` fallback in `nextMonday()` is dead code

**File:** `src/app/api/optimize/day/route.ts:185`
**Issue:** `const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7 || 7`. The only input that makes `(8 - day) % 7` equal to `0` is `day === 1`, which is already handled by the leading ternary. The `|| 7` can never activate.

**Fix:** Remove the `|| 7` suffix: `const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7`.

---

### IN-03: `travelDate` regex validates format but not calendar validity

**File:** `src/lib/validation/optimize-day.ts:49-52`
**Issue:** `/^\d{4}-\d{2}-\d{2}$/` accepts `"9999-99-99"` and `"2026-02-30"`. Downstream `scheduleTimes` would compute day-of-week from an invalid date, producing `NaN` comparisons in opening-hours checks. This pattern is consistent with the existing `/api/optimize` schema, so it is not a regression introduced in Phase 6.

**Fix:** Add a `.refine` that checks `!isNaN(new Date(val).getTime())` after the regex check, or use `date-fns/parseISO` + `isValid`.

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
