# Phase 05 — Polish + Edit + Cost Hardening (Plan)

**Goal:** Manual visit-duration override, abuse/cost hardening (rate limiting + input
debounce), and mobile polish — bringing v1 to production quality.

**Mode:** mvp · **Depends on:** Phase 04 · **Requirements:** INPUT-05

## Success Criteria
1. User can edit a place's visit duration in the itinerary; the schedule re-optimizes. (INPUT-05/SC1)
2. Server-side per-user/IP rate limit rejects place lookups over 50/day with a clear error
   BEFORE any Google API call. (SC2)
3. Front-end debounces place-name input by 300ms so rapid typing doesn't fire redundant work. (SC3)
4. Mobile layout at 375px passes a manual walkthrough (no overlap, readable, tappable). (SC4)

## Waves

### Wave 1 — Visit duration override (05-01)  ✅ DONE (INPUT-05)
- `validation/optimize.ts`: optional `durationOverrides: Record<placeId, minutes>` (15–720) (+ test).
- `/api/optimize`: override takes precedence over type-derived default when building OptimizerPlace.
- PlaceRow: "停留 N 分" derived from slot; click → inline number input → onDurationChange (read-only
  views show static text). Threaded PlaceRow→DayCard→ItineraryView→ResultsLayout→PlaceInputPanel,
  which stores overrides and re-runs optimize. Saved/shared slots reflect the chosen durations.

### Wave 2 — Rate limiting (05-02)  ✅ DONE (SC2)
- `api_usage` table: schema.ts + migration `0003_api_usage.sql` (RLS on, server-only).
- `lib/ratelimit/check.ts`: read-then-count, reject when current+amount>50 (no penalty on reject);
  `wouldExceed`/`subjectFor` unit-tested. Applied at top of `/api/places/resolve` (counts inputs.length)
  before any Google call → 429 with copy. Subject = user id or client IP; getUser best-effort.

### Wave 3 — Input debounce (05-03)  ✅ DONE (SC3)
- `lib/utils/debounce.ts` (+ fake-timer test) and `lib/hooks/use-debounced-value.ts`.
- Panel shows a 300ms-debounced "將查詢 N 個地點" preview so typing doesn't recompute per keystroke.

### Wave 4 — Mobile polish + verify (05-04)  ⏳ NEEDS BROWSER PASS (SC4)
- Code-level: duration editor uses h-7 input; edit affordance is a ghost button (≈24px — bump to ≥44px
  if the 375px walkthrough flags it). DISP-04 was verified at 375px in Phase 03 UAT #1.
- Requires a manual 375px walkthrough (no horizontal scroll, tappable duration editor) — operator/browser.

## Verification (local, this session)
- `tsc --noEmit`: CLEAN across all Phase 05 code.
- 4 new unit-test files (optimize durationOverrides, ratelimit wouldExceed/subjectFor, debounce) — run in CI.
- `next build` / `vitest`: deferred to Linux/CI (win32 native-binding gap, as in Phase 04).

## Operator follow-ups
- Apply migration `0003_api_usage.sql` to the remote DB (sandbox has no DB network).
- Re-optimize on each duration edit costs a Routes API call — acceptable for v1; consider batching later.
