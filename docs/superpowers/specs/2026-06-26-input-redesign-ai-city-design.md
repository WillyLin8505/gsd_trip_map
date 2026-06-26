# Part A — Input-page redesign + AI city inference (Design)

**Date:** 2026-06-26
**Status:** Approved (design)
**Scope:** Part A only. Part B (AI itinerary recommendations from a configurable
URL source + admin backend) is a separate sub-project with its own spec.

## Goal

Simplify and smarten the planning input: one page where the user pastes a place
list and optionally sets city / number of days / start date. When the city is
left blank, infer it from the place list with an LLM so resolution still gets a
correct `locationBias`.

## Requirements

1. Input page holds all inputs: place list (required) + city (optional) +
   number of days (optional) + start date (optional).
2. City is optional. When blank, an LLM infers the destination city/region from
   the place-list text and that drives Google resolution's `locationBias`.
3. User can choose the number of days (`numDays`).
4. User can choose the start date (`travelDate`).

## Current state (what already exists)

- `src/components/place-input-panel.tsx` — flow controller: city (**required**) +
  place textarea → resolve → confirm → optimize.
- `src/lib/validation/resolve.ts` — `resolveRequestSchema`, `city` **required**
  (`min(1)`); `city` used to build `locationBias`.
- `src/lib/google/places-client.ts` — `buildCityBias(city)` (returns null for
  unknown cities) and `textSearch` (folds city into the query when no bias).
- `src/app/api/places/resolve/route.ts` — resolves inputs, returns an array of
  `ResolvedPlace | {status:"NOT_FOUND"}`.
- `/api/optimize` already accepts optional `numDays` and `travelDate`
  (`optimizeRequestSchema`); the optimizer uses `travelDate` for day-of-week /
  opening-hours logic. **No optimizer changes needed.**

## Design

### 1. Input page (`place-input-panel.tsx`)
- **Place list** (required) — unchanged textarea.
- **City** (optional) — text input; placeholder "留空將由 AI 自動判斷".
- **Number of days** (optional) — `<input type="number">` min 1 / max 30; empty =
  「自動」(omit `numDays`, optimizer auto-suggests).
- **Start date** (optional) — native `<input type="date">` (no new dependency);
  default today; produces `YYYY-MM-DD` → `travelDate`. Empty = optimizer default
  (next Monday).
- Single "規劃行程" button. Remove the city-required validation.

### 2. AI city inference (when city blank)
- New module `src/lib/ai/infer-city.ts`:
  - `buildInferCityPrompt(inputs: string[]): string` — pure, unit-testable.
  - `parseInferredCity(text: string): string | null` — pure parser of the model
    reply (model is asked to return just the city name, or `NONE`).
  - `inferCity(inputs, apiKey): Promise<string | null>` — POST to
    `https://api.anthropic.com/v1/messages`, model **`claude-haiku-4-5`**, low
    max_tokens. Works from the Cloudflare Worker (fetch). Fail-open: any
    error/timeout → returns null.
- `resolve/route.ts`: if `city` is empty, call `inferCity(inputs, ANTHROPIC_API_KEY)`;
  use the result as the effective city for `buildCityBias` / query. If inference
  returns null, resolve with no bias (current non-Taiwan behavior).
- New secret **`ANTHROPIC_API_KEY`** — `.env.local` + Cloudflare Worker secret.
- **Response shape change:** resolve returns an object
  `{ places: (ResolvedPlace|NotFound)[], resolvedCity: string|null, cityInferred: boolean }`
  so the UI can show the detected city. Update the client parser accordingly.

### 3. Days / start-date wiring
- `place-input-panel` sends `numDays` (when set) and `travelDate` (when set) to
  `/api/optimize`. No schema/optimizer change.

### 4. Confirm page
- Show "目的地：<city>（AI 自動判斷）" when `cityInferred`, with an editable field;
  changing it re-resolves with the corrected city.

### 5. Schema changes
- `resolveRequestSchema.city` → optional (`z.string().trim().optional()`).
- Keep `locationBias` optional. Add the new response type.

## Data flow

```
Input page (places, city?, numDays?, travelDate?)
  → POST /api/places/resolve { inputs, city? }
      city empty → inferCity(inputs) [Claude Haiku] → effectiveCity
      → textSearch with locationBias(effectiveCity)
      → { places, resolvedCity, cityInferred }
  → Confirm page (shows resolvedCity, editable; numDays/travelDate carried)
  → POST /api/optimize { placeIds, numDays?, travelDate? }
```

## Error handling
- LLM failure/timeout → fail-open (resolve with no bias). Never block resolve.
- Missing `ANTHROPIC_API_KEY` → skip inference (no bias); log once. City-provided
  path is unaffected.

## Testing
- `infer-city.test.ts`: `buildInferCityPrompt` shape; `parseInferredCity`
  (city name, `NONE`, whitespace).
- `resolve` schema test: `city` optional accepted.
- resolve route test: city-empty path calls inferCity (mocked) and applies bias;
  inferCity null → no bias; city-provided path skips inference.
- panel: `numDays`/`travelDate` included in optimize body only when set.

## Out of scope (→ Part B)
- AI itinerary/place recommendations from a configurable source URL.
- Admin/backend mechanism to manage source URLs.
