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
  tasks_completed: 4
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

### Task 4 — GCP Billing Alerts + Quota Cap (PARTIALLY COMPLETED — deviation recorded)

The operator completed step 4 of the GCP Console checklist (Places API (New) enabled on the project) but skipped steps 1–3:

- **SKIPPED: Billing budget alerts at $10/$50/$100** (GCP Console → Billing → Budgets & alerts)
- **SKIPPED: Hard daily quota cap on Places API (New)** (APIs & Services → Places API (New) → Quotas)
- **SKIPPED: API key restriction verification** (browser key = Maps JS + HTTP referrer; server key = Places + Routes + IP)

WARNING: These three items are cost-safety controls classified as non-negotiable in CONTEXT.md and Pitfall 12 in RESEARCH.md. Threat T-01-13 (unbounded Google API spend) remains unmitigated. Do NOT send user traffic to this application until billing alerts, the daily quota cap, and key restrictions are configured.

---

## Empirical Spike Note — Short URL Redirect Resolution

**STATE.md blocker resolved:** The redirect follow implementation was flagged LOW confidence in RESEARCH.md. The spike findings:

- `fetch(url, { method: 'HEAD', redirect: 'follow' })` resolves the final URL through `response.url` (the Fetch API standard behavior). This is the primary mechanism.
- The GET fallback (when `response.url` from HEAD matches the input URL) is retained as robustness for cases where some URL shorteners don't honor HEAD.
- The implementation was validated via unit tests with injected mock fetches. Real network testing of live `maps.app.goo.gl` URLs requires manual verification (network access not available in this environment).
- **Recommendation:** Before launch, manually test 3 real `maps.app.goo.gl` short URLs by running the resolver locally with a real API key to confirm HEAD suffices or GET fallback is needed in production.

---

## Deviations from Plan

### Skipped Critical Cost Controls (Task 4 — operator decision)

**[OPERATOR DECISION] GCP billing alerts, daily quota cap, and key restrictions skipped**

- **Found during:** Task 4 human checkpoint
- **Issue:** The operator confirmed that Places API (New) is enabled on the project (step 4 of the checklist in `docs/cost-controls.md`) but skipped steps 1–3: billing budget alerts at $10/$50/$100, the hard daily quota cap on Places API (New), and API key restriction verification.
- **Impact:** Threat T-01-13 (unbounded Google API spend via DoS/excessive use) is unmitigated. Per RESEARCH.md Pitfall 12 and CONTEXT.md "non-negotiable" designation, these controls must be active before any user-facing traffic is routed to the application.
- **Required action before user traffic:** Complete steps 1–3 in `docs/cost-controls.md`:
  1. Create billing budget alerts at $10, $50, $100 in GCP Console → Billing → Budgets & alerts
  2. Set a hard daily request limit on Places API (New) in GCP Console → APIs & Services → Places API (New) → Quotas
  3. Confirm browser key is restricted to Maps JavaScript API + HTTP referrers; server key restricted to Places API (New) + Routes API + IP
- **Files modified:** None — this is an operator GCP Console action, not a code change.
- **Status:** OPEN — must be resolved before production traffic

**Also:** The unused `eq`, `sql`, and `z` imports were removed from route.ts (cleanup, not a deviation).

---

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-01-13 (OPEN — not mitigated) | GCP Console (operator action) | Unbounded Google API spend: billing alerts ($10/$50/$100) and daily quota cap NOT configured. User traffic must be blocked until this is resolved. |
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

**Task 4 (GCP Console):**
- Places API (New) enabled: CONFIRMED by operator
- Billing alerts ($10/$50/$100): SKIPPED — OPEN blocker for production
- Daily quota cap (Places API New): SKIPPED — OPEN blocker for production
- API key restrictions verified: SKIPPED — OPEN blocker for production

## Self-Check: PASSED (with open deviation — see Threat Flags for T-01-13)
