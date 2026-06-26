---
status: complete
phase: 03-core-ui
source: [03-VERIFICATION.md]
started: 2026-06-26
updated: 2026-06-26
---

## Current Test

none — all tests resolved

## Tests

### 1. Mobile responsive layout at 375px (DISP-04)

expected: |
  Open the app in Chrome/Edge DevTools at 375px (iPhone SE viewport).
  Complete the full flow: paste a place, resolve, click "最佳化行程", see results.
  - No horizontal scroll bar appears
  - "行程表" and "地圖" tabs are visible and toggle the two panels
  - All buttons/tabs are at least 44px tall (touch targets)
result: pass

### 2. Google Maps InfoWindow runtime click (SC4 + DISP-03)

expected: |
  With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set in .env.local, run `npm run dev` and open http://localhost:3000.
  Complete the full flow to get a map result. Click a numbered marker on the map.
  - InfoWindow opens showing: place name, time slot (e.g. 09:00–11:00)
  - If the place has hoursUnknown=true: amber warning "營業時間未知，建議出發前確認" appears
  - No CPU runaway / infinite loop (useCallback guard working)
result: pass
notes: |
  User confirmed: InfoWindow opens with place name + time slot, markers clickable,
  no CPU runaway. Marker/InfoWindow behavior (DISP-03 + SC4) verified in browser.
  Open concern noted in Gaps below re: time-slot values — user instructed to
  treat the feature as working and proceed; concern carried forward, not blocking.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- [CARRIED — non-blocking] Time-slot values were reported as possibly "off by hours"
  during browser UAT. Static trace found NO timezone conversion in the optimizer,
  routes-client (seconds→minutes correct), opening-hours storage (verbatim local),
  or display layer — displayed slot == optimizer output (day-1 first stop pinned to
  09:00 local). Could not reproduce server-side (tool sandbox cannot resolve the
  direct-connection DB host). User directed to assume the feature works pending an
  explicit report. Revisit if confirmed.
- [SUSPECT — non-blocking] `place-row.tsx summarizeHours()` always renders
  `openingHours[0]` (the first period, typically Sunday) regardless of the actual
  travel day-of-week. This can show the wrong day's hours in the 行程表 one-liner.
  Candidate fix for Phase 5 (opening-hours per-day breakdown is already deferred there).
