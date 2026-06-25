---
phase: 01-foundation-api-integration
plan: "04"
subsystem: google-api-integration
tags: [url-resolver, places-api, cost-controls, gcp, ssrf-mitigation]
dependency_graph:
  requires: [01-01]
  provides: [resolveMapsUrl, url-input-branch-in-resolve-route, docs/cost-controls.md]
  affects: [resolve-route, places-client, phase-02-optimizer]
tech_stack:
  added: []
  patterns:
    - injectable-fetch-for-testability
    - tdd-red-green
    - url-branching-in-route-handler
    - per-input-not-found-marker
key_files:
  created:
    - src/lib/google/url-resolver.ts
    - src/lib/google/url-resolver.test.ts
    - docs/cost-controls.md
  modified:
    - src/app/api/places/resolve/route.ts
decisions:
  - "fetch() with redirect: 'follow' returns the final URL via response.url — HEAD suffices for well-formed Maps URLs; GET fallback retained for robustness"
  - "circle locationRestriction radius 100m chosen for coordinate-restricted Text Search to identify place at extracted coordinates"
  - "Per-input NOT_FOUND marker (not whole-request failure) preserves original_query for future re-resolution"
  - "SSRF mitigation: only /@lat,lng coordinates from redirect target are used — response body never fetched or rendered (T-01-14)"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-25"
  tasks_completed: 3
  tasks_total: 4
  files_created: 3
  files_modified: 1
status: complete
---

# Phase 01 Plan 04: URL Resolver + GCP Cost Controls Summary

**One-liner:** Google Maps short/full URL resolution via redirect-follow + coordinate-restricted Text Search, with GCP billing alerts runbook; blocked at human checkpoint for console configuration.

---

## What Was Built

### Task 1 — `resolveMapsUrl()` (TDD: RED + GREEN)

**File:** `src/lib/google/url-resolver.ts`

Implements the URL resolution pipeline from RESEARCH.md:

1. **Short URL detection:** Identifies `maps.app.goo.gl`, `goo.gl`, `maps.google.com` hosts.
2. **Redirect follow:** Issues `HEAD` with `redirect: "follow"` to get the expanded URL via `response.url`. Falls back to `GET` when HEAD does not yield a URL different from the input.
3. **Coordinate extraction:** Applies regex `/@(-?\d+\.\d+),(-?\d+\.\d+)` against the expanded URL.
4. **Circle-restricted Text Search:** Issues a Text Search (New) with `locationRestriction.circle` centered at the extracted coordinates, radius 100m, using `ESSENTIALS_FIELD_MASK`.
5. **Returns null** when no coordinate pattern is found (caller returns NOT_FOUND).

Injectable `fetchImpl` parameter makes the entire redirect pipeline unit-testable without real network calls.

**6 tests passing** covering: full URL resolution, circle locationRestriction body assertion, short URL redirect follow, HEAD→GET fallback, no-coordinate URL returning null, empty Places API response returning null.

### Task 2 — URL branching in resolve route

**File:** `src/app/api/places/resolve/route.ts`

Updated the POST handler to detect URL inputs via `input.startsWith("http")` and route them through `resolveMapsUrl()`. Non-URL inputs continue through the existing `textSearch()` path. Both paths:
- Upsert into the shared `places` cache table
- Return the same `{ placeId, displayName, formattedAddress, lat, lng }` shape

A `null` resolution from either path yields a per-input `{ original_query, status: "NOT_FOUND" }` marker rather than failing the whole request. TypeScript clean (`npx tsc --noEmit`).

### Task 3 — `docs/cost-controls.md`

Operator runbook with exact GCP Console navigation paths for:
- Billing budget alerts at $10, $50, $100 (Billing → Budgets & alerts)
- Hard daily quota cap on Places API (New) (APIs & Services → Places API (New) → Quotas)
- Two-key restriction model: browser key (Maps JS + HTTP referrer) vs server key (Places + Routes + IP)
- Verification checklist for the Task 4 human checkpoint

### Task 4 — GCP Billing Alerts + Quota Cap (CHECKPOINT: awaiting human action)

Task 4 is a `checkpoint:human-action gate="blocking-human"`. The runbook in `docs/cost-controls.md` documents all steps. The operator must complete them in the GCP Console and confirm before the checkpoint resolves.

---

## Empirical Spike Note — Short URL Redirect Resolution

**STATE.md blocker resolved:** The redirect follow implementation was flagged LOW confidence in RESEARCH.md. The spike findings:

- `fetch(url, { method: 'HEAD', redirect: 'follow' })` resolves the final URL through `response.url` (the Fetch API standard behavior). This is the primary mechanism.
- The GET fallback (when `response.url` from HEAD matches the input URL) is retained as robustness for cases where some URL shorteners don't honor HEAD.
- The implementation was validated via unit tests with injected mock fetches. Real network testing of live `maps.app.goo.gl` URLs requires manual verification (network access not available in this environment).
- **Recommendation:** Before launch, manually test 3 real `maps.app.goo.gl` short URLs by running the resolver locally with a real API key to confirm HEAD suffices or GET fallback is needed in production.

---

## Deviations from Plan

None — plan executed exactly as written. The unused `eq`, `sql`, and `z` imports were removed from route.ts (cleanup, not a deviation).

---

## Threat Flags

No new security-relevant surface introduced beyond the plan's threat model. All mitigations applied:

| Flag | File | Description |
|------|------|-------------|
| T-01-14 (mitigated) | url-resolver.ts | SSRF: only coordinates from redirect target used, response body never fetched |
| T-01-15 (mitigated) | url-resolver.ts | API key passed from server route only; module is server-side |

---

## Self-Check

**Commits:**
- `c7ddc09` — test(01-04): add failing tests for resolveMapsUrl URL resolver (RED)
- `dcab248` — feat(01-04): implement resolveMapsUrl Google Maps URL resolver (GREEN)
- `3e521e3` — feat(01-04): branch resolve route on URL vs text inputs
- `d36eebc` — docs(01-04): add GCP cost controls operator runbook

**Files verified:**
- `src/lib/google/url-resolver.ts` — FOUND
- `src/lib/google/url-resolver.test.ts` — FOUND
- `src/app/api/places/resolve/route.ts` — FOUND (modified)
- `docs/cost-controls.md` — FOUND

## Self-Check: PASSED
