# Input-page Redesign + AI City Inference (Part A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the planner's input a single page (place list + optional city + optional days + optional start date), and when city is blank, infer it from the place list with Claude Haiku so Google resolution still gets a correct locationBias.

**Architecture:** `city` becomes optional in the resolve schema. The resolve route, when city is empty, calls a new pure-ish `infer-city` module (Claude Haiku via fetch, fail-open) and uses the inferred city for the existing `buildCityBias`/textSearch. Resolve now returns `{ places, resolvedCity, cityInferred }`. The input panel gains optional city / days / start-date controls and forwards `numDays`/`travelDate` (already supported by `/api/optimize`).

**Tech Stack:** Next.js 16 (App Router, Route Handlers), TypeScript, Zod v4, Drizzle, Vitest (node env, `globals: true`), Anthropic Messages API (model `claude-haiku-4-5`).

## Global Constraints

- Tests run under Vitest **node environment** (`vitest.config.ts`), `globals: true` — assert on data, not DOM.
- Server secrets are read from `process.env` only; never expose to the client. New secret: `ANTHROPIC_API_KEY` (`.env.local` locally + Cloudflare Worker secret in prod).
- LLM inference is **fail-open**: any error/timeout/missing-key → return null → resolve proceeds with no city bias (current non-Taiwan behavior). Never block or 500 resolve because of inference.
- `/api/optimize` already accepts optional `numDays` (int ≥1, ≤? — schema currently `min(1)`) and `travelDate` (`YYYY-MM-DD`). Do NOT change the optimize schema or optimizer.
- Anthropic API: endpoint `https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, model `claude-haiku-4-5`.
- Commit messages end with the project's `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

- `src/lib/validation/resolve.ts` (modify) — `city` optional; add `ResolveResponse` type.
- `src/lib/validation/resolve.test.ts` (create) — schema tests.
- `src/lib/ai/infer-city.ts` (create) — `buildInferCityPrompt`, `parseInferredCity` (pure), `inferCity` (fetch, fail-open).
- `src/lib/ai/infer-city.test.ts` (create) — pure-function tests.
- `src/app/api/places/resolve/route.ts` (modify) — optional city, call `inferCity` when blank, return `{ places, resolvedCity, cityInferred }`.
- `src/lib/places/optimize-request.ts` (create) — `buildOptimizeBody` pure helper.
- `src/lib/places/optimize-request.test.ts` (create) — helper tests.
- `src/components/place-input-panel.tsx` (modify) — optional city + days + start-date controls; parse new resolve response; forward `numDays`/`travelDate`; show inferred city on confirm.
- `.env.example` (modify) — add `ANTHROPIC_API_KEY`.

---

## Task 1: Make `city` optional + add resolve response type

**Files:**
- Modify: `src/lib/validation/resolve.ts`
- Test: `src/lib/validation/resolve.test.ts` (create)

**Interfaces:**
- Produces: `resolveRequestSchema` (now `city?: string`), `ResolveResponse` type, `ResolvedPlace`, `NotFoundMarker`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/validation/resolve.test.ts
import { describe, it, expect } from "vitest";
import { resolveRequestSchema } from "./resolve";

describe("resolveRequestSchema", () => {
  it("accepts inputs without a city (city optional)", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["清水寺"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBeUndefined();
  });

  it("accepts inputs with a city", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["清水寺"], city: "京都" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBe("京都");
  });

  it("trims a provided city", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["x"], city: "  京都  " });
    expect(r.success && r.data.city).toBe("京都");
  });

  it("rejects an empty inputs array", () => {
    expect(resolveRequestSchema.safeParse({ inputs: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validation/resolve.test.ts`
Expected: FAIL (city currently required → first test fails).

- [ ] **Step 3: Edit the schema**

In `src/lib/validation/resolve.ts`, replace the `city` field:

```ts
  /**
   * Destination city — OPTIONAL. When omitted/blank, the resolve route infers it
   * from the inputs (Claude Haiku) and uses that for locationBias. When provided,
   * it is used directly.
   */
  city: z.string().trim().min(1).optional(),
```

Then append the response type after `ResolvedPlace`:

```ts
/** NOT_FOUND marker for a single input that did not resolve. */
export interface NotFoundMarker {
  original_query: string;
  status: "NOT_FOUND";
}

/** Response body of POST /api/places/resolve. */
export interface ResolveResponse {
  places: Array<ResolvedPlace | NotFoundMarker>;
  /** City actually used for biasing (provided or inferred); null if none. */
  resolvedCity: string | null;
  /** True when resolvedCity was inferred by the LLM (not user-provided). */
  cityInferred: boolean;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validation/resolve.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/resolve.ts src/lib/validation/resolve.test.ts
git commit -m "feat(resolve): make city optional; add ResolveResponse type"
```

---

## Task 2: City-inference module (Claude Haiku, fail-open)

**Files:**
- Create: `src/lib/ai/infer-city.ts`
- Test: `src/lib/ai/infer-city.test.ts`

**Interfaces:**
- Produces:
  - `buildInferCityPrompt(inputs: string[]): string`
  - `parseInferredCity(replyText: string): string | null`
  - `inferCity(inputs: string[], apiKey: string | undefined): Promise<string | null>`

- [ ] **Step 1: Write the failing test (pure functions)**

```ts
// src/lib/ai/infer-city.test.ts
import { describe, it, expect } from "vitest";
import { buildInferCityPrompt, parseInferredCity } from "./infer-city";

describe("buildInferCityPrompt", () => {
  it("includes every input place name", () => {
    const p = buildInferCityPrompt(["清水寺", "金閣寺"]);
    expect(p).toContain("清水寺");
    expect(p).toContain("金閣寺");
  });
  it("instructs replying NONE when unknown", () => {
    expect(buildInferCityPrompt(["x"])).toContain("NONE");
  });
});

describe("parseInferredCity", () => {
  it("returns the trimmed city name", () => {
    expect(parseInferredCity(" 京都 ")).toBe("京都");
  });
  it("takes only the first line", () => {
    expect(parseInferredCity("京都\n(Kyoto)")).toBe("京都");
  });
  it("strips surrounding quotes", () => {
    expect(parseInferredCity('"京都"')).toBe("京都");
  });
  it("returns null for NONE (any case)", () => {
    expect(parseInferredCity("none")).toBeNull();
    expect(parseInferredCity("NONE")).toBeNull();
  });
  it("returns null for empty reply", () => {
    expect(parseInferredCity("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/infer-city.test.ts`
Expected: FAIL with "Cannot find module './infer-city'".

- [ ] **Step 3: Write the module**

```ts
// src/lib/ai/infer-city.ts

/**
 * Infer the destination city from a list of place names using Claude Haiku.
 * Pure helpers (prompt builder + reply parser) are separated from the network
 * call so they can be unit-tested without an API key.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

/** Build the user prompt asking for a single most-likely destination city. */
export function buildInferCityPrompt(inputs: string[]): string {
  const list = inputs.map((s) => `- ${s}`).join("\n");
  return [
    "You are given a list of attraction / restaurant / place names a traveler",
    "wants to visit. Identify the single most likely destination city (or",
    "region) they are all in.",
    "",
    "Reply with ONLY the city name, in the same language as the input.",
    'If you cannot tell, reply exactly "NONE".',
    "",
    "Places:",
    list,
  ].join("\n");
}

/** Parse the model reply into a city string, or null. */
export function parseInferredCity(replyText: string): string | null {
  const first = (replyText ?? "").split("\n")[0]?.trim() ?? "";
  const cleaned = first.replace(/^["'「『]+|["'」』]+$/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.toUpperCase() === "NONE") return null;
  return cleaned;
}

/**
 * Call Claude Haiku to infer the city. Fail-open: returns null on any error,
 * timeout, or missing key — the caller then resolves with no city bias.
 */
export async function inferCity(
  inputs: string[],
  apiKey: string | undefined
): Promise<string | null> {
  if (!apiKey || inputs.length === 0) return null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 32,
        messages: [{ role: "user", content: buildInferCityPrompt(inputs) }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data?.content?.[0]?.text ?? "";
    return parseInferredCity(text);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/infer-city.test.ts`
Expected: PASS (7 assertions across the two describes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/infer-city.ts src/lib/ai/infer-city.test.ts
git commit -m "feat(ai): add Claude Haiku city inference (fail-open)"
```

---

## Task 3: Wire inference into the resolve route + new response shape

**Files:**
- Modify: `src/app/api/places/resolve/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `inferCity` (Task 2); `resolveRequestSchema`, `ResolveResponse` (Task 1); existing `textSearch`, `resolveMapsUrl`, `getDb`, `checkAndCount`, `subjectFor`, `getUser`.
- Produces: resolve returns `ResolveResponse` JSON `{ places, resolvedCity, cityInferred }`.

- [ ] **Step 1: Add the import + inference logic**

In `src/app/api/places/resolve/route.ts`, add near the other imports:

```ts
import { inferCity } from "@/lib/ai/infer-city";
import type { ResolveResponse } from "@/lib/validation/resolve";
```

After `const { inputs, city, locationBias } = parsed.data;` and AFTER the rate-limit
block, add:

```ts
  // City: use the provided one, else infer from the inputs (fail-open).
  let effectiveCity = city ?? "";
  let cityInferred = false;
  if (!effectiveCity) {
    const inferred = await inferCity(inputs, process.env.ANTHROPIC_API_KEY);
    if (inferred) {
      effectiveCity = inferred;
      cityInferred = true;
    }
  }
```

- [ ] **Step 2: Use `effectiveCity` in textSearch and change the return**

In the per-input loop, the text path currently calls `textSearch(input, { city, apiKey, locationBias: bias })`. Change `city` to `effectiveCity`:

```ts
      placeResult = await textSearch(input, {
        city: effectiveCity,
        apiKey,
        locationBias: bias,
      });
```

Replace the final `return NextResponse.json(results);` with:

```ts
  const body: ResolveResponse = {
    places: results,
    resolvedCity: effectiveCity || null,
    cityInferred,
  };
  return NextResponse.json(body);
```

- [ ] **Step 3: Add the env var to `.env.example`**

Append to `.env.example`:

```
# Anthropic API key — used server-side to infer the destination city from the
# place list when the user leaves the city blank (Claude Haiku).
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Type-check**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/places/resolve/route.ts .env.example
git commit -m "feat(resolve): infer city when blank; return {places,resolvedCity,cityInferred}"
```

---

## Task 4a: Pure `buildOptimizeBody` helper

**Files:**
- Create: `src/lib/places/optimize-request.ts`
- Test: `src/lib/places/optimize-request.test.ts`

**Interfaces:**
- Produces: `buildOptimizeBody(args: { placeIds: string[]; numDays?: number | null; travelDate?: string | null; durationOverrides?: Record<string, number> }): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/places/optimize-request.test.ts
import { describe, it, expect } from "vitest";
import { buildOptimizeBody } from "./optimize-request";

describe("buildOptimizeBody", () => {
  it("includes only placeIds when nothing else set", () => {
    expect(buildOptimizeBody({ placeIds: ["a"] })).toEqual({ placeIds: ["a"] });
  });
  it("includes numDays when a positive number", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: 3 })).toEqual({
      placeIds: ["a"], numDays: 3,
    });
  });
  it("omits numDays when null/0/undefined", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: 0 })).toEqual({ placeIds: ["a"] });
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: null })).toEqual({ placeIds: ["a"] });
  });
  it("includes travelDate when a non-empty string", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], travelDate: "2026-07-01" })).toEqual({
      placeIds: ["a"], travelDate: "2026-07-01",
    });
  });
  it("omits travelDate when empty/null", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], travelDate: "" })).toEqual({ placeIds: ["a"] });
  });
  it("includes durationOverrides only when non-empty", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], durationOverrides: {} })).toEqual({ placeIds: ["a"] });
    expect(buildOptimizeBody({ placeIds: ["a"], durationOverrides: { a: 90 } })).toEqual({
      placeIds: ["a"], durationOverrides: { a: 90 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/places/optimize-request.test.ts`
Expected: FAIL with "Cannot find module './optimize-request'".

- [ ] **Step 3: Write the helper**

```ts
// src/lib/places/optimize-request.ts

/** Build the POST /api/optimize body, omitting optional fields that aren't set. */
export function buildOptimizeBody(args: {
  placeIds: string[];
  numDays?: number | null;
  travelDate?: string | null;
  durationOverrides?: Record<string, number>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { placeIds: args.placeIds };
  if (typeof args.numDays === "number" && args.numDays >= 1) body.numDays = args.numDays;
  if (args.travelDate) body.travelDate = args.travelDate;
  if (args.durationOverrides && Object.keys(args.durationOverrides).length > 0) {
    body.durationOverrides = args.durationOverrides;
  }
  return body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/places/optimize-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/places/optimize-request.ts src/lib/places/optimize-request.test.ts
git commit -m "feat(places): buildOptimizeBody helper (omit unset optionals)"
```

---

## Task 4b: Input-page controls + new response parsing + inferred-city display

**Files:**
- Modify: `src/components/place-input-panel.tsx`

**Interfaces:**
- Consumes: `buildOptimizeBody` (Task 4a); resolve response `{ places, resolvedCity, cityInferred }` (Tasks 1/3).

- [ ] **Step 1: Add state + remove the required-city guard**

Add state near the existing `useState` calls:

```tsx
  const [numDays, setNumDays] = useState<string>("");      // "" = 自動
  const [startDate, setStartDate] = useState<string>("");   // YYYY-MM-DD ("" = 預設)
  const [resolvedCity, setResolvedCity] = useState<string | null>(null);
  const [cityInferred, setCityInferred] = useState<boolean>(false);
```

In `handleResolve`, DELETE the block that errors when city is empty:

```tsx
    if (!city.trim()) {
      setError("請輸入目的地城市");
      return;
    }
```

- [ ] **Step 2: Send optional city; parse the new response shape**

In `handleResolve`, change the request body to send `city` only when non-empty:

```tsx
        body: JSON.stringify(
          city.trim() ? { inputs, city: city.trim() } : { inputs }
        ),
```

Replace the response-parsing block. The response is now an object:

```tsx
      const data = (await response.json()) as {
        places?: Array<ResolvedPlace | { status: "NOT_FOUND"; original_query: string }>;
        resolvedCity?: string | null;
        cityInferred?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "地點查詢失敗，請稍後再試");
        return;
      }

      const allItems = data.places ?? [];
      const resolved = allItems.filter(
        (item): item is ResolvedPlace => !("status" in item && item.status === "NOT_FOUND")
      );
      if (resolved.length === 0) {
        setError("沒有找到符合的地點，請檢查輸入內容");
        return;
      }
      setResolvedCity(data.resolvedCity ?? null);
      setCityInferred(Boolean(data.cityInferred));
      setResolvedPlaces(resolved);
```

- [ ] **Step 3: Use `buildOptimizeBody` for the optimize call**

Add import at top:

```tsx
import { buildOptimizeBody } from "@/lib/places/optimize-request";
```

In `handleOptimize`, replace the body construction with:

```tsx
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildOptimizeBody({
            placeIds: resolvedPlaces.map((p) => p.placeId),
            numDays: numDays ? Number(numDays) : null,
            travelDate: startDate || null,
            durationOverrides: overrides,
          })
        ),
      });
```

(Keep the existing `overrides` parameter / `handleDurationChange` behavior.)

- [ ] **Step 4: Add the day/date controls to the input form**

In the step-1 form (after the place-list textarea block, before the resolve button), add:

```tsx
        {/* City (optional) */}
        <div className="space-y-1.5">
          <label htmlFor="city" className="block text-sm font-medium text-foreground">
            目的地城市（選填）
          </label>
          <Input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="留空將由 AI 自動判斷"
            className="h-11"
          />
        </div>

        {/* Days + start date */}
        <div className="flex gap-3">
          <div className="space-y-1.5 flex-1">
            <label htmlFor="numDays" className="block text-sm font-medium text-foreground">
              待幾天（選填）
            </label>
            <Input
              id="numDays" type="number" min={1} max={30}
              value={numDays} onChange={(e) => setNumDays(e.target.value)}
              placeholder="自動" className="h-11"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <label htmlFor="startDate" className="block text-sm font-medium text-foreground">
              開始日期（選填）
            </label>
            <Input
              id="startDate" type="date"
              value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
```

Update `isResolveDisabled` so it no longer requires city:

```tsx
  const isResolveDisabled = !rawInputs.trim() || loading === "resolving";
```

(If a `city` element already exists in step 1 from before, replace it with the optional version above — do not duplicate.)

- [ ] **Step 5: Show the inferred city on the confirm step (editable)**

In the step-2 branch (`resolvedPlaces.length > 0`), above `<ResolvedPlaceList ...>`, add:

```tsx
        {resolvedCity && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              目的地：<span className="font-medium text-foreground">{resolvedCity}</span>
              {cityInferred && <span className="ml-1 text-amber-600">（AI 自動判斷）</span>}
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setCity(resolvedCity); setResolvedPlaces([]); }}
            >
              修改城市重新查詢
            </Button>
          </div>
        )}
```

(Clearing `resolvedPlaces` returns the user to step 1 with the city pre-filled so they can correct it and re-resolve.)

- [ ] **Step 6: Reset new state in `handleReset`**

Add to `handleReset`:

```tsx
    setNumDays("");
    setStartDate("");
    setResolvedCity(null);
    setCityInferred(false);
```

- [ ] **Step 7: Type-check + run tests**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: all tests pass (including new resolve/infer-city/optimize-request tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/place-input-panel.tsx
git commit -m "feat(ui): optional city + days + start-date on input; show inferred city"
```

---

## Self-Review

- **Spec coverage:** Req 1 (single input page) → Task 4b form. Req 2 (city optional + AI infer) → Tasks 1, 2, 3, 4b (display). Req 3 (days) → Task 4a/4b (`numDays`). Req 4 (start date) → Task 4a/4b (`travelDate`). Confirm-page inferred-city display → Task 4b Step 5. Schema change → Task 1. Tests → each task. Env/secret → Task 3. ✓
- **Placeholders:** none — every code step has full code.
- **Type consistency:** `ResolveResponse { places, resolvedCity, cityInferred }` defined in Task 1, produced in Task 3, consumed in Task 4b. `buildOptimizeBody` signature consistent between Task 4a definition and 4b usage. `inferCity(inputs, apiKey)` defined in Task 2, called in Task 3.

## Notes / risks
- On Cloudflare, `ANTHROPIC_API_KEY` must be added as a Worker secret (`wrangler secret put ANTHROPIC_API_KEY`) and the resolve route reads `process.env.ANTHROPIC_API_KEY` (populated by OpenNext at runtime). Without it, inference is skipped (fail-open) — city-provided flow still works.
- Verifying live behavior on Cloudflare uses the existing WSL build/deploy or Workers Builds CI; no new deploy steps here.
