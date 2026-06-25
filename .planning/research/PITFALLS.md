# Domain Pitfalls: Travel Itinerary Planner

**Domain:** Travel itinerary planner with Google Places API + route optimization + interactive map
**Project:** 旅遊行程規劃器 (gsd_food_map)
**Researched:** 2026-06-25
**Confidence:** MEDIUM (cross-checked web sources + official documentation)

---

## Critical Pitfalls

These cause rewrites, production outages, or cost spirals.

---

### Pitfall 1: Google Places API Cost Explosion Without Field Masking

**Severity:** CRITICAL

**What goes wrong:**
Text Search and Nearby Search cost $32 per 1,000 requests at Tier 1 (0–100k/month). If you request all fields (opening hours, photos, reviews, contact data), you hit the highest SKU tier (Pro or Enterprise) and incur additional surcharges up to $0.005/request on top of the base rate. A single user adding 20 places triggers 20+ API calls. If the app gains modest traction (500 users/day adding 15 places each), you hit 7,500 Text Search calls/day — 225,000/month — costing ~$7,200 before the credit applies.

**Why it happens:**
Developers build with "request everything" during development, never set billing alerts, and discover the bill at month end. The Places API (New) requires a `FieldMask` header; omitting it defaults to all fields at maximum billing tier.

**Consequences:**
- Unbounded spend with no hard ceiling unless a quota cap is manually configured
- $200 monthly credit is no longer a flat credit — it is per-SKU, so it may not apply uniformly across all usage

**Prevention:**
- Always set `FieldMask` to only the fields you need. For itinerary use, that is: `id,displayName,formattedAddress,location,regularOpeningHours,currentOpeningHours,nationalPhoneNumber,rating,priceLevel,websiteUri,primaryTypeDisplayName`
- Set a hard daily quota cap in Google Cloud Console before going live
- Set a billing alert at $20, $50, $100
- Cache Place Details in your database per `place_id` — cache is allowed for up to 30 days per Google ToS (place_id itself can be cached indefinitely)
- Never call Place Details in a loop without debouncing or batching confirmation from the user

**Detection (early warning signs):**
- Daily cost report in GCP exceeds $5 within first week of testing
- API logs show field mask is empty or `*`
- No quota cap configured in Cloud Console

**Phase to address:** API Integration Phase — implement field masking and caching layer before any user-facing feature ships

---

### Pitfall 2: Using Legacy Places API Instead of Places API (New)

**Severity:** CRITICAL

**What goes wrong:**
The legacy Places API (findPlaceFromText, Nearby Search legacy, Place Details legacy) was feature-frozen in March 2025 and is moving toward decommission with 12-month notice. Starting a new project on the legacy API means a mandatory migration mid-development or post-launch, which involves breaking JSON response schema changes and new required field masking patterns.

**Why it happens:**
Most online tutorials, Stack Overflow answers, and third-party client libraries (including older versions of `@googlemaps/js-api-loader`) still reference the legacy API. Developers copy-paste examples and build on frozen infrastructure.

**Consequences:**
- Forced migration with breaking schema changes at an unpredictable future date
- Legacy API lacks performance improvements in the new API
- New per-SKU free tier structure only applies to new API

**Prevention:**
- Use Places API (New) exclusively from day 1
- Use the `places.googleapis.com/v1/places` base URL, not `maps.googleapis.com/maps/api/place/`
- Use `X-Goog-FieldMask` request header with every call
- Verify npm packages explicitly support new API (check their changelog)

**Detection:**
- Any code calling `/maps/api/place/findplacefromtext/` or `/maps/api/place/textsearch/` uses legacy API
- Response body contains `results[]` array (legacy) instead of `places[]` (new API)

**Phase to address:** Phase 1 / initial API integration spike — use new API from first line of code

---

### Pitfall 3: Opening Hours Data Is Unreliable and Sparse

**Severity:** CRITICAL

**What goes wrong:**
The system's core promise is "排出考慮營業時間的最佳行程" (schedule respecting opening hours), but Google Places API opening hours data has three major gaps:

1. **Missing data:** Many place types (smaller restaurants, temples, scenic overlooks, street food stalls) have no `regularOpeningHours` field at all. The API returns no error — the field is simply absent.
2. **Stale data:** API data lags real-world changes by days to weeks. A restaurant that changed hours last Tuesday may still show old hours.
3. **Holiday/special hours not reflected:** Known bug in Google's Issue Tracker — `specialDays` and temporary closures are inconsistently populated. A place closed on a national holiday may show as "open."

**Why it happens:**
The API relies on business owner-submitted data and crowd-sourced corrections. Not all businesses manage their Google Business Profile.

**Consequences:**
- Algorithm produces itineraries where user arrives at a closed attraction
- If your algorithm treats "no hours data" as "always open," it schedules 24h places alongside 9-18h places without flagging the gap
- User blame lands on your product, not Google

**Prevention:**
- When `regularOpeningHours` is absent, flag the place with a `hoursUnknown: true` property and display a warning in the UI: "營業時間未知，建議出發前確認"
- Do not treat missing hours as "always open" — treat it as "unknown, proceed with caution"
- In the scheduling algorithm, deprioritize placing unknowns in time-sensitive morning/evening slots
- Show data freshness indicator: "資料更新時間" from `utcOffsetMinutes` + last fetch timestamp

**Detection:**
- Test with 20 real Taiwanese attractions — count what percentage lack `regularOpeningHours`
- Spot-check 3 places whose actual hours differ from API data

**Phase to address:** Algorithm Phase AND UI Phase — handle at both layers

---

## High Severity Pitfalls

---

### Pitfall 4: Greedy Nearest-Neighbor Produces Visibly Bad Routes

**Severity:** HIGH

**What goes wrong:**
The simplest route optimization approach — always go to the geographically nearest next stop — produces routes that are demonstrably worse than what a human would choose. In pathological cases (clustered stops with a few outliers), nearest-neighbor creates zigzag routes 50%+ longer than optimal. For a 5-day trip with 25 stops, users will immediately notice backtracking on the map.

**Why it happens:**
Nearest-neighbor is O(n²) and easy to implement. Developers ship it and never add the improvement step.

**Consequences:**
- Core value proposition ("最佳排程") fails — output is not actually optimal
- Users manually reorder stops, defeating the purpose of the app
- If users share bad itineraries, it reflects poorly on the product

**Prevention:**
- Use nearest-neighbor only as the initial seed solution
- Always follow with 2-opt local search improvement (swaps pairs of edges to remove crossings)
- For ≤ 20 stops: nearest-neighbor + 2-opt converges in < 100ms in the browser
- For > 20 stops: OR-Tools (server-side) or approximate nearest-neighbor + 2-opt
- Never ship without showing the route polyline on map — visual inspection immediately catches bad routes

**Detection:**
- Draw route on map during development. If the route line crosses itself, the algorithm is wrong
- Compare output distance to manually sorted "obvious" route for a test case

**Phase to address:** Algorithm Phase (route optimization core)

---

### Pitfall 5: Day-Splitting Ignores Geographic Clustering

**Severity:** HIGH

**What goes wrong:**
When splitting a list of places across multiple days, a naive approach assigns places sequentially or by category (all museums day 1, all restaurants day 2) without regard to geography. This produces days where the user drives 40km to cluster A, then 40km back to cluster B on consecutive days, when sorting by geographic cluster would eliminate all backtracking.

**Why it happens:**
Day splitting and route optimization are treated as sequential problems: first split, then optimize each day. The correct formulation is simultaneous — Team Orienteering Problem with Time Windows (TOPTW).

**Consequences:**
- Itinerary looks suboptimal even after per-day route optimization
- Users with cross-city trips (e.g., 台北 + 九份 + 宜蘭 in 3 days) get irrational day assignments

**Prevention:**
- Use geographic clustering (k-means or spectral clustering on lat/lng) as the primary day-assignment heuristic before route optimization
- For cross-city trips: hard-cluster by city/region first, then apply route optimization within each cluster
- Allow users to drag-and-drop stops between days as manual override — the algorithm suggestion is a starting point, not gospel

**Detection:**
- Visually inspect multi-day route on map — if routes for different days geographically overlap significantly, the split is wrong
- Test with a known cross-city itinerary (e.g., 台北 → 台中 → 高雄 5-day trip)

**Phase to address:** Algorithm Phase

---

### Pitfall 6: Chinese Place Name Ambiguity Causes Wrong Location Matches

**Severity:** HIGH

**What goes wrong:**
User inputs "故宮" (Palace Museum) — there are major ones in both Taipei and Beijing. User inputs "101" — this matches properties in multiple cities. User inputs "誠品書店" — multiple branches in different locations. The Places API Text Search with a Chinese query returns the globally most-prominent result, not the geographically intended one.

Additionally, traditional vs. simplified Chinese character variants of the same name may return different results or no results. The API `language` parameter influences but does not guarantee result language.

**Why it happens:**
Text Search without location biasing uses global relevance. Chinese place names are often shared across cities and countries. The app accepts freeform Chinese text with no geographic context per-query.

**Consequences:**
- User planning a Taipei trip gets a Beijing attraction inserted into their itinerary
- Silent wrong data — app shows a "matched" place with high confidence while being geographically wrong
- User only discovers the error when checking the map

**Prevention:**
- Always send `locationBias` or `locationRestriction` with Text Search, set to a bounding box around the trip's intended city/region
- Prompt user to specify destination city/country BEFORE place lookup, use that to bias all searches
- After Text Search match, show the matched place name + address to user and require confirmation before adding to itinerary
- Show a map preview of the matched location — visual confirmation catches geographic errors immediately
- Support Google Maps URL input as a fallback — URL contains `place_id` which is unambiguous

**Detection:**
- Test with "故宮", "101", "中正紀念堂" without location bias and verify results are correct
- Any Text Search returning a place in a different country than the trip destination is a false positive

**Phase to address:** API Integration Phase — location biasing must be in the first implementation

---

### Pitfall 7: Place ID Staleness Breaks Saved Itineraries

**Severity:** HIGH

**What goes wrong:**
Your app saves itineraries with `place_id` as the stable identifier. When a business closes, moves, or is merged in Google's database, its `place_id` returns `NOT_FOUND`. Itineraries saved 6+ months ago silently break when the user tries to re-open them.

**Why it happens:**
`place_id` appears stable but Google recommends refreshing IDs cached longer than 12 months. Businesses close and move frequently, especially restaurants.

**Consequences:**
- Returning user opens saved itinerary — multiple places show as "not found"
- User loses trust in the app's ability to persist their data reliably

**Prevention:**
- Store the original Text Search query string alongside `place_id` in the database
- On itinerary load, detect NOT_FOUND errors and attempt re-resolution using the stored query string + approximate coordinates
- Show "此地點資料已更新" (place data updated) rather than silent failure or hard error
- `place_id` itself can be stored indefinitely (exempt from ToS caching restrictions), but validate on re-open

**Detection:**
- Create test itineraries and verify they still load after 3 months
- Monitor for NOT_FOUND errors in production API logs

**Phase to address:** Data Persistence Phase / Backend Phase

---

## Medium Severity Pitfalls

---

### Pitfall 8: Timezone Handling Breaks Opening Hours Comparisons

**Severity:** MEDIUM

**What goes wrong:**
Google Places API returns `regularOpeningHours` with day-of-week and local time in the place's timezone, but it does NOT always return the timezone identifier explicitly. If your server stores planned visit times in UTC and compares them to opening hours without converting to the place's local timezone, you get incorrect "is it open?" calculations — especially for trips spanning multiple timezones (e.g., a Japan + South Korea trip).

**Why it happens:**
Developers store everything in UTC (correct practice) but forget to apply the place's timezone offset when checking if a scheduled visit time falls within opening hours.

**Consequences:**
- Algorithm thinks a place is open during a time window it is actually closed
- Produces itineraries that schedule morning visits to places that don't open until noon (in local time)
- Cross-timezone trips (台灣 + 日本) amplify this — 1-hour offset causes consistent scheduling errors

**Prevention:**
- Always extract and store `utcOffsetMinutes` from Place Details response alongside opening hours
- Use a timezone-aware datetime library (date-fns-tz or Luxon, not moment.js which is deprecated)
- For the scheduling algorithm, work in local-time for opening hours comparison, convert back to UTC for storage

**Detection:**
- Test with a place that has UTC+9 timezone (Japan) while running server in UTC+0 or UTC+8
- Test places that close at midnight — ensure algorithm does not treat this as open all night

**Phase to address:** Algorithm Phase

---

### Pitfall 9: Map Rendering Regression When Showing Multi-Day Route Lines

**Severity:** MEDIUM

**What goes wrong:**
Rendering each day's route as a polyline plus all place markers simultaneously causes visible lag with 5+ days × 10+ stops = 50+ markers plus 5 route lines. React re-renders the entire map on any state change (e.g., switching selected day), causing full polyline recalculation each time.

**Why it happens:**
Leaflet wraps each marker and polyline as a DOM element. React Leaflet triggers re-renders that recreate DOM nodes unnecessarily. Developers do not memoize map layers.

**Consequences:**
- Noticeable lag when switching between days
- Mobile devices stutter when panning the map with route lines visible

**Prevention:**
- Memoize polyline and marker components — use `React.memo` or stable layer keys
- Only render the currently active day's route polyline; toggle visibility rather than mount/unmount
- Use Leaflet.MarkerCluster from the start (even for small counts) to avoid future refactor
- Separate map state from UI state — map should not re-render when sidebar form state changes

**Detection:**
- Performance test with 5-day × 10 stop itinerary; check frame rate when switching days
- Use browser DevTools Rendering panel to identify unnecessary re-renders

**Phase to address:** UI Phase

---

### Pitfall 10: Sharing Link Exposes Itinerary Data Without Access Control

**Severity:** MEDIUM

**What goes wrong:**
Public sharing links (e.g., `/itinerary/share/abc123`) are generated with no access control check. If the link is a sequential integer ID, all saved itineraries are enumerable. Even with random UUIDs, if a user makes their itinerary "private" later, the link continues to work because the route handler has no concept of visibility state.

**Why it happens:**
Sharing link is implemented as "give UUID, return data" with no auth middleware. Visibility toggle is added to the UI later but never wired to the API check.

**Consequences:**
- User "privatizes" their itinerary but link remains valid
- Sequential IDs allow enumeration of all itineraries (IDOR vulnerability)

**Prevention:**
- Use UUIDv4 for all itinerary IDs (never sequential integers)
- Add a `visibility` field (`public` | `private`) to the Itinerary model from day 1
- Public share links must check `visibility === 'public'` server-side, not rely on obscure URL
- Authenticated endpoints for private itinerary access, unauthenticated endpoints only for public itineraries

**Detection:**
- Try accessing `/itinerary/share/<uuid>` after setting itinerary to private — should return 403
- Check database for sequential IDs (must be UUID or random slug)

**Phase to address:** Auth + Persistence Phase

---

### Pitfall 11: Algorithm Treats Lunch and Dinner As Optional Extras

**Severity:** MEDIUM

**What goes wrong:**
The scheduling algorithm fills the day with attractions and adds restaurants wherever they "fit," treating meal times as low-priority. This produces itineraries where lunch is at 3pm or dinner at 10pm because the algorithm prioritized sightseeing time windows. Alternatively, no restaurants are scheduled at all if the user only added attractions.

**Why it happens:**
The optimization objective is "visit as many places as possible within opening hours" — this maximizes attraction count, not user experience. Meals are not hard constraints unless explicitly modeled.

**Consequences:**
- Itinerary is logistically valid but practically uncomfortable
- Users add restaurants manually, defeating one of the app's selling points

**Prevention:**
- Reserve 12:00–13:30 and 18:00–19:30 as soft-blocked "meal time" slots in the scheduling algorithm
- If no restaurant is in those slots, prompt user: "您的行程沒有午餐安排，要加入附近餐廳嗎？"
- If user's input list includes restaurants, the algorithm should schedule them preferentially in meal windows

**Detection:**
- Test with 10-attraction input and observe output schedule — note meal times
- If all restaurants end up outside 12-14h and 18-20h windows, algorithm needs meal time bias

**Phase to address:** Algorithm Phase

---

### Pitfall 12: No Rate Limiting on User-Triggered API Calls Enables Cost Attack

**Severity:** MEDIUM

**What goes wrong:**
The "add place" flow triggers a Text Search call ($0.032) every time a user types a place name. Without server-side rate limiting, a single malicious user (or a simple for-loop script) can exhaust the project's daily API quota in minutes and run up charges.

**Why it happens:**
Frontend input is not rate-limited. API key is used server-side but the server imposes no per-user call limit.

**Consequences:**
- Quota exhaustion shuts down the service for all users
- Unexpected billing spikes

**Prevention:**
- Debounce user input (300ms minimum) before triggering search on frontend
- Implement server-side per-user rate limiting: max 50 Place searches per user per day in free tier
- Set Google Cloud Console daily quota cap to enforce hard ceiling on total API calls
- Require authenticated request for all API-proxying endpoints — no anonymous API calls

**Detection:**
- Use `wrk` or `curl` loop to simulate rapid place search calls and observe cost/quota counter
- Check GCP quota dashboard for any spikes

**Phase to address:** API Integration Phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Google Places API integration | Field masking omitted, requesting all fields | Set FieldMask in first request and never remove it |
| Place name search (Chinese) | Wrong geographic match without location bias | Always set `locationBias` with city bounding box |
| Route optimization algorithm | Nearest-neighbor shipping without 2-opt improvement | Test route visually on map before shipping |
| Multi-day trip splitting | Sequential or category-based split ignoring geography | Apply geographic clustering before day assignment |
| Opening hours scheduling | Missing hours treated as "always open" | Flag unknown hours explicitly in data model |
| Map rendering | Polylines and markers causing re-renders on state change | Memoize map layers, use layer visibility toggle |
| Data persistence | Saving place_id without original query fallback | Store query string alongside place_id |
| Sharing feature | Visibility state not enforced server-side | Implement visibility check in API middleware |
| User auth | JWT in localStorage vulnerable to XSS | Use HttpOnly cookie for JWT storage |
| API cost | No billing alerts or quota cap configured | Set billing alert + hard cap before any user traffic |

---

## Sources

- [Places API Usage and Billing — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) — MEDIUM confidence (official)
- [Google Places API Pricing, Costs & Alternative Options — SafeGraph](https://www.safegraph.com/guides/google-places-api-pricing/) — MEDIUM confidence (cross-checked)
- [Google Maps Platform Deprecations](https://developers.google.com/maps/deprecations) — MEDIUM confidence (official)
- [Places API Legacy Deprecation — MapAtlas](https://mapatlas.eu/blog/google-places-api-legacy-deprecation-eu) — MEDIUM confidence (verified against official timeline)
- [Place IDs documentation — Google for Developers](https://developers.google.com/maps/documentation/places/web-service/place-id) — MEDIUM confidence (official)
- [Opening hours bug — Google Issue Tracker](https://issuetracker.google.com/issues/35829064) — MEDIUM confidence (official bug tracker)
- [Traveling Salesman Problem — OR-Tools Google](https://developers.google.com/optimization/routing/tsp) — MEDIUM confidence (official)
- [Nearest neighbour algorithm — Wikipedia](https://en.wikipedia.org/wiki/Nearest_neighbour_algorithm) — MEDIUM confidence
- [Optimizing Leaflet with Many Markers — Medium](https://medium.com/@silvajohnny777/optimizing-leaflet-performance-with-a-large-number-of-markers-0dea18c2ec99) — MEDIUM confidence
- [Policies and attributions for Places API — Google](https://developers.google.com/maps/documentation/places/web-service/policies) — MEDIUM confidence (official ToS)
- [KomoTrip multi-day itinerary algorithm — PeerJ](https://peerj.com/articles/cs-3350/) — MEDIUM confidence (peer-reviewed)
- [JWT Best Practices — Curity](https://curity.io/resources/learn/jwt-best-practices/) — MEDIUM confidence
- [Why Online Travel Apps Fail — JPLoft](https://www.jploft.com/blog/why-online-travel-apps-fail) — LOW confidence (industry blog)
