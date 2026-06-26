---
phase: 6
slug: interactive-day-editing
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (environment: "node", globals: true) |
| **Config file** | `vitest.config.ts` (project root; `@` → `./src`) |
| **Quick run command** | `npx vitest run src/lib/optimizer/day.test.ts src/lib/places/closest-day.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 seconds (full suite; pure unit + route tests, no DOM) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/optimizer/day.test.ts src/lib/places/closest-day.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| classifyPlace categories (餐廳/點心/行程; restaurant-wins tie; null→attraction) | day | — | EDIT-02 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| scheduleSingleDay reorder=false keeps order + assigns times | day | — | EDIT-01 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| scheduleSingleDay reorder=true attractions shortest-path | day | — | EDIT-02 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| scheduleSingleDay reorder=true 1 restaurant → lunch slot | day | — | EDIT-02 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| scheduleSingleDay reorder=true 2 restaurants → lunch+dinner | day | — | EDIT-02 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| scheduleSingleDay reorder=true no restaurant → plain path | day | — | EDIT-02 | — | N/A | unit | `npx vitest run src/lib/optimizer/day.test.ts` | ❌ W0 | ⬜ pending |
| pickClosestDay nearest-day (single-day + tie) | closest-day | — | EDIT-01 | — | N/A | unit | `npx vitest run src/lib/places/closest-day.test.ts` | ❌ W0 | ⬜ pending |
| POST /api/optimize/day Zod validation → 400 | route | — | EDIT-01 | — | Reject malformed body before any Google API call | route | `npx vitest run src/app/api/optimize/day/route.test.ts` | ❌ W0 | ⬜ pending |
| POST /api/optimize/day 422 for unresolved placeIds | route | — | EDIT-01 | — | 422 names unresolved IDs | route | `npx vitest run src/app/api/optimize/day/route.test.ts` | ❌ W0 | ⬜ pending |
| POST /api/optimize/day reorder=false happy path → 200 | route | — | EDIT-01 | — | N/A | route | `npx vitest run src/app/api/optimize/day/route.test.ts` | ❌ W0 | ⬜ pending |
| POST /api/optimize/day reorder=true happy path → 200 | route | — | EDIT-02 | — | N/A | route | `npx vitest run src/app/api/optimize/day/route.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Final Task IDs are assigned by the planner; this map binds every behavior to an automated command and requirement.*

---

## Wave 0 Requirements

- [ ] `src/lib/optimizer/day.test.ts` — stubs for `classifyPlace` + `scheduleSingleDay` (EDIT-01, EDIT-02)
- [ ] `src/lib/places/closest-day.test.ts` — stubs for `pickClosestDay` (EDIT-01)
- [ ] `src/app/api/optimize/day/route.test.ts` — stubs for `POST /api/optimize/day` (EDIT-01, EDIT-02); mock `@/lib/db` (chained `.select().from().where()`) + `@/lib/google/routes-client` `computeRouteMatrix`, stub `process.env.GOOGLE_PLACES_API_KEY`
- Framework already installed (Vitest) — no install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| F1 paste→add place renders into the closest day on the live results page | EDIT-01 | UI interaction + live Places/Routes APIs; unit tests cover the pure logic but not the rendered result | On the results page, paste a place near day N's cluster, click 「加入行程」, confirm it appears in day N re-timed, order otherwise preserved, and the map marker updates |
| F2 「自動安排」 re-orders a day and slots restaurants into meal windows in the browser | EDIT-02 | Visual ordering + meal-window placement on real data | Click 「自動安排」 on a day containing ≥1 restaurant; confirm the day reorders by route and the restaurant(s) land in 11:30–13:30 / 17:30–19:30 |
| Failure path keeps itinerary intact (NOT_FOUND / API error shows inline message, never wipes) | EDIT-01 | Requires inducing a live failure | Paste a nonsense place → expect 「找不到這個地點」 inline, itinerary unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files)
- [ ] No watch-mode flags (use `vitest run`, not `vitest`)
- [ ] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
