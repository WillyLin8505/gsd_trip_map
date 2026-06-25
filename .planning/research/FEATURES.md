# Feature Landscape: Travel Itinerary Planner

**Domain:** Travel itinerary planning web app (paste-to-plan, route optimization)
**Researched:** 2026-06-25
**Confidence:** MEDIUM (cross-referenced: Wanderlog, TripIt, Sygic Travel, Mindtrip, academic TOPTW literature)

---

## Table Stakes

Features users expect. Missing = users leave or the product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Paste / type list of places as input | Core product promise — frictionless entry | Low | Must accept Chinese names AND Google Maps URLs |
| Auto-resolve place details via Google Places API | Users don't want to look up hours manually | Medium | Name → Place ID → opening hours, rating, address |
| Day-by-day itinerary output | Every competitor shows day-grouped results | Medium | "Day 1 / Day 2 / Day 3" card view |
| Time slot scheduling per place | Users need to see "10:00–12:00 at X, 13:00–15:00 at Y" | Medium | Must respect opening hours; show arrival + departure times |
| Interactive map view | Visual geographic context is non-negotiable | Medium | At minimum: pins per day color-coded; ideally: daily route polyline |
| Shareable public link | Users share itineraries with travel partners | Low | Read-only public URL, no account required to view |
| Save multiple itineraries | Users plan >1 trip; sessions are lost otherwise | Low | Requires auth; saved to user account |
| Account registration / login | Required for save + share features | Low | Email/password; OAuth (Google) strongly expected |
| Mobile-responsive layout | Users check itineraries on phone while traveling | Low | RWD — not a native app, but must be usable on mobile |
| Auto-suggest number of days | Users don't know how many days they need | Low | Derived from place count × avg visit duration |

---

## Differentiators

Features that set this product apart. Not universally expected, but high perceived value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Opening-hours-aware scheduling | Prevents "museum is closed Monday" disasters; competitors don't enforce this automatically | High | Requires TOPTW (time-windowed TSP) solver, not just distance sort |
| Ticket / admission info display | Saves a lookup step; users appreciate seeing "¥200 admission" inline | Low | Google Places price_level is categorical (1–4), not exact price; show "$$" or note "check site" |
| Visit duration auto-estimation by place type | Users don't know how long to budget per stop | Medium | Heuristic table by category (museum ~2h, temple ~45min, restaurant ~1h); let users override |
| Geographic clustering for multi-day split | Smart day assignment groups nearby places — avoids cross-city commutes within a day | High | Cluster by lat/lng before optimizing route within each day |
| User can edit / reorder generated itinerary | Generated output is a starting point, not final | Medium | Drag-and-drop day reassignment, manual time override |
| Cross-city / multi-region support | Competitor Wanderlog supports this; important for 5+ day trips | Low (routing) / Medium (UX) | Each city = its own cluster; transit day between cities |
| Trip print / PDF export | Travelers print or screenshot for offline reference | Low | Browser print CSS or basic PDF generation |
| Place photos from Google Places | Visual confirmation the right place was matched | Low | Places API returns photo references |

---

## Anti-Features

Features to explicitly NOT build in v1. Each has a clear reason and a fallback.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Flight / hotel booking integration | Scope creep into e-commerce; adds legal/payment complexity; not the core pain point | Show a "book via Google" external link if place has booking URL |
| Real-time ticket price lookup | Google Places API does not provide exact prices; third-party ticket APIs add cost + fragility | Display price_level ($$) from Places API with "verify before visiting" disclaimer |
| Offline / native mobile app | V1 is web-only per PROJECT.md; native app is a full second project | RWD ensures usability; browser "add to home screen" covers basic mobile need |
| Budget tracking & expense splitting | Wanderlog does this; not in core value prop; adds significant UX/data model complexity | Out of scope; direct users to Wanderlog/Splitwise for expenses |
| Real-time flight status alerts | TripIt's domain; requires airline data integration (expensive, complex) | Not relevant — this tool is pre-trip planning, not during-trip management |
| Group voting / polling on places | Nice for consensus-building but adds significant async UX complexity | Simple: anyone with edit access can add/remove places; no voting flow |
| AI recommendation / discover new places | LLM-generated suggestions are a different product; user's list is the authoritative input | The product enhances a user-provided list, it doesn't generate the list |
| Social feed / public discovery | Travel social network is a different product category | Keep sharing strictly to private links per itinerary |
| Packing list / checklist features | Off-topic; adds app surface without advancing core value | Suggest dedicated apps (TripIt, PackPoint) |

---

## Feature Dependencies

```
Account registration
  └── Save itinerary
        └── Share itinerary (public link)

Google Places API resolution
  └── Opening hours data
        └── Opening-hours-aware scheduling (TOPTW)
              └── Time slot display per place

Visit duration estimation
  └── Auto day-count suggestion
        └── Geographic clustering for day assignment
              └── Route optimization within each day
                    └── Day-by-day itinerary output
                          └── Map view (daily route)

Paste input (text / Maps URL)
  └── Place name resolution (Google Places Text Search / URL parse)
        └── [All of the above]
```

---

## v1 MVP Recommendation

**Prioritize — ship without these and the product has no value:**

1. Paste input — accept Chinese names and Google Maps URLs
2. Google Places resolution — name to hours/details
3. Visit duration heuristics — per place type
4. Opening-hours-aware multi-day scheduling (TOPTW or greedy time-window approach)
5. Day-by-day itinerary display with time slots
6. Interactive map view — daily color-coded pins + route line
7. Account auth (email/password + Google OAuth)
8. Save + share (public read-only link)

**Defer to v2:**
- Drag-and-drop reorder / manual override (v1: show regenerate button instead)
- PDF / print export
- Geographic clustering for cross-city trips (v1: single city assumed; prompt user for city)
- Place photos inline (v1: text-only place cards to reduce API cost)
- Cross-city multi-region support

**Never build (confirmed anti-features):**
- Booking integration, real-time pricing, native app, budget tracking, group voting

---

## Competitor Reference Summary

| Product | Core Strength | Notable Gap |
|---------|--------------|-------------|
| Wanderlog | All-in-one: map + budget + collab | Route optimization is Pro-only; gets slow on large trips; no opening-hours enforcement |
| TripIt | Auto-import from email; flight alerts | Passive organizer, not a planner; weak maps; no optimization |
| Sygic Travel | Strong offline support; discovery | Limited optimization; niche audience |
| Mindtrip | AI from screenshot/paste | Recommends places rather than optimizing user's list |
| TripAdvisor Trips | Large POI database | No optimization; planning is secondary to reviews |

**Our differentiator vs all of them:** The only tool that takes a user-provided list and produces an opening-hours-constrained, distance-optimized, time-slotted multi-day schedule automatically. Competitors either require manual ordering (Wanderlog), don't schedule times (TripAdvisor), or generate the list for you instead of optimizing yours (Mindtrip).

---

## Phase-to-Feature Mapping

| Phase | Features |
|-------|----------|
| Phase 1: Core Input + Data | Paste input, Google Places resolution, visit duration heuristics, place card display |
| Phase 2: Optimization Engine | Opening-hours-aware scheduling, TSP/TOPTW route optimization, day-count suggestion, multi-day clustering |
| Phase 3: Itinerary Display | Day-by-day view with time slots, interactive map with daily routes and color-coded pins |
| Phase 4: Account + Persistence | Registration/login (Google OAuth), save itineraries, share via public link |
| Phase 5: Polish + Edit | Manual reorder/edit, trip regeneration, mobile RWD polish, print/PDF export |

---

## Sources

- [Wanderlog vs TripIt 2024 comparison — ghosttownhotel.com](https://www.ghosttownhotel.com/blog/wanderlog-vs-tripit-2024)
- [Wanderlog vs TripIt — wanderlog.com/blog](https://wanderlog.com/blog/2024/11/26/wanderlog-vs-tripit/)
- [Wanderlog Review 2025 — wandrly.app](https://www.wandrly.app/reviews/wanderlog)
- [Comparing 7 Top Travel Planning Apps — mightytravels.com](https://www.mightytravels.com/2024/09/comparing-7-top-travel-planning-apps-features-usability-and-real-world-performance/)
- [Best AI Travel Planner 2026 — stippl.io](https://www.stippl.io/blog/best-ai-travel-planner-2026)
- [Optimized Travel Itineraries TOPTW — MDPI Algorithms](https://www.mdpi.com/1999-4893/18/2/110)
- [Building a Travel Route Optimizer — Medium](https://medium.com/@van.evanfebrianto/building-a-personal-travel-route-optimizer-a-technical-odyssey-e46b5b49a1fa)
- [Google Places API overview — developers.google.com](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Google Places API Place Details — developers.google.com](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Why Trip Planning Feels Broken — tripgogo.ai](https://tripgogo.ai/content/blog/why-trip-planning-still-feels-broken/)
- [Best Group Travel Planning Apps 2026 — avosquado.app](https://www.avosquado.app/blog/best-group-travel-planning-apps-2026-complete-comparison)
