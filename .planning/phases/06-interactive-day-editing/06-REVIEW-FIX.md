---
phase: 06-interactive-day-editing
fixed_at: 2026-06-27T02:11:00Z
review_path: .planning/phases/06-interactive-day-editing/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-06-27T02:11:00Z
**Source review:** `.planning/phases/06-interactive-day-editing/06-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, WR-03, WR-04, WR-05, WR-06)
- Fixed: 6
- Skipped: 0

**Test results:** 275 tests pass (27 test files) — up from 273 baseline (+2 new tests for WR-03 and WR-05).
**TypeScript:** `npx tsc --noEmit` exits clean (0 errors).

---

## Fixed Issues

### WR-03: Duplicate placeIds rejected at Zod schema level

**Files modified:** `src/lib/validation/optimize-day.ts`, `src/app/api/optimize/day/route.test.ts`
**Commit:** `175dca7`
**Applied fix:** Added `.refine((ids) => new Set(ids).size === ids.length, "placeIds must be unique — duplicate IDs would schedule the same place twice")` to the `placeIds` Zod array. Duplicate IDs now return a 400 with `{ error: "Validation failed", details: ... }` before any DB or Routes API spend. Added a new route test verifying the 400 on `["ChIJp1", "ChIJp2", "ChIJp1"]`.

---

### WR-05: DB query wrapped in try-catch returning typed 500

**Files modified:** `src/app/api/optimize/day/route.ts`, `src/app/api/optimize/day/route.test.ts`
**Commit:** `2fdb066`
**Applied fix:** Wrapped the Drizzle `.select().from(places).where(inArray(...))` call in a try-catch that returns `{ error: "Database error: <message>" }` as a `OptimizeDayErrorResponse`-conformant 500. Added `type Place` import from the schema for the `let rows: Place[]` type annotation. Added a new route test that simulates a Hyperdrive connection timeout and asserts the 500 response has an `error` string field and that `computeRouteMatrix` is not called.

---

### CR-01: `unscheduled` surfaced in F1 add flow

**Files modified:** `src/components/day-place-adder.tsx`
**Commit:** `bc3cdbd`
**Applied fix:** Changed destructuring from `const { day }` to `const { day, unscheduled }`. After a successful HTTP response, checks `unscheduled.some((u) => u.placeId === newPlace.placeId)`. If the newly-added place was rejected (e.g., closed on that day), calls `setError(`「${newPlace.displayName}」在該天無法安排（${reason}）`)` and returns early — `replaceDay` is NOT called and the input is NOT cleared. The user sees a zh-TW message and their place is never silently lost.

---

### WR-04: Deduplicate placeId before API call and `resolvedPlaces` append

**Files modified:** `src/components/day-place-adder.tsx`
**Commit:** `c4c1bb8`
**Applied fix:** Before building the `placeIds` array, checks `existingPlaceIds.includes(newPlace.placeId)`. If true, calls `setError("這個地點已在當天行程中")` and returns early — no API call is made and the itinerary is unchanged. Also updated `setResolvedPlaces` from `(prev) => [...prev, newPlace]` to `(prev) => prev.some((p) => p.placeId === newPlace.placeId) ? prev : [...prev, newPlace]` to guard the coord-map state against duplicates in the unlikely case of concurrent state updates.

---

### WR-06: Outer catch added to `handleAdd`

**Files modified:** `src/components/day-place-adder.tsx`
**Commit:** `88b598a`
**Applied fix:** Changed `try { ... } finally { setLoading(false) }` to `try { ... } catch { setError("加入地點失敗，請稍後再試"); } finally { setLoading(false) }`. The outer catch fires only for truly unexpected throws (e.g., `pickClosestDay` on an empty `daysWithCoords`, or a malformed API response shape) — the existing inner try-catches already handle the known network-failure paths and return early. The user now always sees an error message rather than a silent idle state.

---

### CR-02: `unscheduled` surfaced in F2 auto-arrange flow

**Files modified:** `src/components/place-input-panel.tsx`, `src/components/day-card.tsx`
**Commit:** `b2e3ee1`
**Applied fix (place-input-panel.tsx):** Changed destructuring from `const { day }` to `const { day, unscheduled }`. After `replaceDay(dayNumber, day)` (so the scheduled portion renders immediately), if `unscheduled.length > 0`, throws `new Error(`自動安排完成，但以下地點無法排入當天：${reasons}`)` where `reasons` is the `reason` field of each unscheduled entry joined by `"；"`. The `reason` field already contains human-readable zh-TW text with the place's display name (produced by the scheduler).

**Applied fix (day-card.tsx):** Changed `catch {` to `catch (err) {` and replaced the hardcoded `"自動安排失敗，請稍後再試"` string with `err instanceof Error && err.message ? err.message : "自動安排失敗，請稍後再試"`. This lets the thrown partial-success message pass through and be displayed in the card's `arrangeError` Alert, while network/server errors still fall back to the generic zh-TW copy. The scheduled visits are still shown because `replaceDay` was already called before the throw.

---

## Skipped Issues

None.

---

_Fixed: 2026-06-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
