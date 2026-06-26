---
status: testing
phase: 03-core-ui
source: [03-VERIFICATION.md]
started: 2026-06-26
updated: 2026-06-26
---

## Current Test

number: 1
name: Mobile responsive layout at 375px — no horizontal scroll, Tabs for map/itinerary
expected: |
  At 375px viewport width, the full input→resolve→optimize→results flow has no horizontal scroll.
  Mobile: shadcn Tabs show "行程表" and "地圖" panels that toggle correctly. Tab height is 44px (h-11).
  Desktop (>768px): ItineraryView on left (420px scroll area) and MapView on right (flex-1 sticky) render side by side.
awaiting: user response

## Tests

### 1. Mobile responsive layout at 375px (DISP-04)

expected: |
  Open the app in Chrome/Edge DevTools at 375px (iPhone SE viewport).
  Complete the full flow: paste a place, resolve, click "最佳化行程", see results.
  - No horizontal scroll bar appears
  - "行程表" and "地圖" tabs are visible and toggle the two panels
  - All buttons/tabs are at least 44px tall (touch targets)
result: [pending]

### 2. Google Maps InfoWindow runtime click (SC4 + DISP-03)

expected: |
  With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set in .env.local, run `npm run dev` and open http://localhost:3000.
  Complete the full flow to get a map result. Click a numbered marker on the map.
  - InfoWindow opens showing: place name, time slot (e.g. 09:00–11:00)
  - If the place has hoursUnknown=true: amber warning "營業時間未知，建議出發前確認" appears
  - No CPU runaway / infinite loop (useCallback guard working)
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
