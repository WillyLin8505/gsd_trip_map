# Roadmap: Travel Itinerary Planner（旅遊行程規劃器）

## Overview

Five phases, each delivering a vertical slice of working software. Phase 1 locks in the infrastructure and cost-controlled Google API layer that everything else depends on. Phase 2 builds and validates the optimization engine — the core product differentiator — before any UI is designed around its output. Phase 3 wires the engine to a full UI and delivers an end-to-end anonymous user flow. Phase 4 adds accounts, persistence, and sharing. Phase 5 hardens the product with rate limiting, mobile polish, and the manual visit duration override.

## Phases

- [ ] **Phase 1: Foundation + API Integration** - DB schema, Supabase auth scaffold, Google Places API with shared cache and cost controls
- [ ] **Phase 2: Optimization Engine** - Server-side TSP scheduler (nearest-neighbor + 2-opt + greedy bin-packing) producing structured day-by-day output
- [ ] **Phase 3: Core UI** - Full end-to-end anonymous user flow: PlaceInput, ItineraryView, MapView, mobile-responsive layout
- [ ] **Phase 4: Auth + Persistence + Sharing** - User accounts (email + Google OAuth), saved itineraries, public share links
- [ ] **Phase 5: Polish + Edit + Cost Hardening** - Manual visit duration override, rate limiting, mobile polish, per-user API call cap

## Phase Details

### Phase 1: Foundation + API Integration
**Goal**: Infrastructure is in place — database schema, auth scaffold, and Google Places API resolution with shared cache and hard cost controls — so that all subsequent phases can build on a stable, cost-safe foundation.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: INPUT-01, INPUT-02, INPUT-03, INPUT-04
**Success Criteria** (what must be TRUE):
  1. A developer can POST a Chinese place name and receive resolved place details (name, coordinates, address, opening hours) from the API, with field masking applied on every call.
  2. A second lookup of the same place_id returns cached data from the database without triggering a new Google API call.
  3. A Google Maps short URL or full URL submitted to the resolve endpoint returns the correct place details.
  4. The destination city field is applied as a locationBias on every Text Search call, so "故宮" resolves to the correct city's result.
  5. GCP billing alerts and daily quota cap are active; the Supabase schema (users, itineraries, itinerary_days, place_visits, places) is seeded and RLS policies are in place.
**Plans**: 4 plans
- [ ] 01-01-PLAN.md — Walking Skeleton: scaffold + places cache + Text Search resolve + UI form end-to-end (SKELETON.md)
- [ ] 01-02-PLAN.md — Full schema (itineraries/days/visits) + RLS policies + Supabase auth scaffold
- [ ] 01-03-PLAN.md — Cache-first GET /api/places/details + duration table + hours_unknown rule
- [ ] 01-04-PLAN.md — Google Maps URL resolution + GCP cost controls (billing alerts + daily quota cap)

### Phase 2: Optimization Engine
**Goal**: A server-side optimizer accepts a resolved place list and produces a validated, structured day-by-day schedule that respects opening hours, minimizes travel distance, and assigns concrete arrival/departure times.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):
  1. Given a list of N resolved places, POST /api/optimize returns a schedule grouped into days, each day containing an ordered list of visits with arrival and departure times.
  2. No visit in the output schedule falls outside a place's opening hours window; places with unknown hours are flagged with hoursUnknown and retain their schedule slot with a warning.
  3. The optimizer applies nearest-neighbor + 2-opt route improvement — the final route has no obvious visual crossings when rendered on a map.
  4. The system auto-suggests a number of days derived from total visit durations plus estimated travel time; a caller-supplied day count overrides the suggestion.
  5. A test suite with at least three representative itinerary scenarios (small/medium/large N, mix of opening-hour constraints) passes and produces known-correct day groupings.
**Plans**: TBD

### Phase 3: Core UI
**Goal**: An anonymous user can paste a list of places, see them resolved and confirmed, click "Optimize," and receive a day-by-day itinerary table and interactive map — all without creating an account.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, AUTH-01
**Success Criteria** (what must be TRUE):
  1. A user pastes Chinese place names (or Google Maps links) into the input area, sees each place resolved with address confirmation, and can proceed to optimization without logging in.
  2. After optimization, the user sees a day-by-day itinerary table showing each day's places with arrival and departure times; each place row displays opening hours and ticket info from the Places API.
  3. The interactive map renders per-day colored polylines and numbered markers; clicking a marker shows the place name and time slot.
  4. Places with unknown opening hours display a visible warning in both the itinerary table and map tooltip.
  5. The full flow (input → resolve → optimize → view) is usable on a mobile browser at 375px viewport width without horizontal scrolling or overlapping elements.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Auth + Persistence + Sharing
**Goal**: A logged-in user can save itineraries, retrieve them on any device, and share a read-only link with anyone — while the same product continues to work for anonymous users.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. A user can register with email + password and log in; Google OAuth login also completes successfully and creates a session.
  2. A logged-in user can save the current itinerary, navigate away, return, and load it from a saved itineraries list.
  3. A logged-in user can save multiple itineraries and see all of them in a list view.
  4. A logged-in user can generate a public share link; a person opening that link (without an account) can view the full itinerary read-only.
  5. Making an itinerary private (toggling off sharing) causes the share link to return a 404 — server-side visibility is enforced, not just hidden in the UI.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Polish + Edit + Cost Hardening
**Goal**: The product is hardened against cost overruns and abuse, the manual visit duration override is available to users, and the mobile experience is polished to production quality.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: INPUT-05
**Success Criteria** (what must be TRUE):
  1. A user can click on any place's duration field in the itinerary and type a new value; the schedule re-optimizes to reflect the change.
  2. Server-side per-user rate limiting rejects excessive place-lookup requests (over 50/day) with a clear error message before any Google API call is made.
  3. The front-end debounces place name input by 300ms so that rapid typing does not trigger multiple API calls.
  4. The mobile layout at 375px passes a manual walkthrough of the full flow with no overlapping touch targets, readable font sizes, and accessible tap areas.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + API Integration | 0/4 | Planned | - |
| 2. Optimization Engine | 0/? | Not started | - |
| 3. Core UI | 0/? | Not started | - |
| 4. Auth + Persistence + Sharing | 0/? | Not started | - |
| 5. Polish + Edit + Cost Hardening | 0/? | Not started | - |
