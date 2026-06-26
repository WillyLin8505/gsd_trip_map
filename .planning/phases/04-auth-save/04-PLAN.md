# Phase 04 — Auth + Persistence + Sharing (Plan)

**Goal:** A logged-in user can save itineraries, retrieve them on any device, and share a
read-only link — while anonymous use (Phase 03) keeps working unchanged.

**Mode:** mvp · **Depends on:** Phase 03 · **Requirements:** AUTH-02, AUTH-03, AUTH-04, AUTH-05

## Foundation already in place (do NOT rebuild)
- DB tables: `itineraries` (user_id, title, total_days, city/region, **share_token uuid unique**,
  **is_public bool**), `itinerary_days`, `place_visits` — schema.ts.
- RLS policies (Phase 01 / Plan 02): owner CRUD + public share SELECT via `is_public + share_token`.
- Deps installed: `@supabase/ssr ^0.12`, `@supabase/supabase-js ^2`, `nanoid ^5`, drizzle, zod, react-query.
- Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY all set.

## Success Criteria (must be TRUE)
1. Register with email+password and log in; Google OAuth also completes and creates a session. (AUTH-02/03)
2. Logged-in user saves the current itinerary, navigates away, returns, loads it from a list. (AUTH-04)
3. Multiple saved itineraries appear in a list view. (AUTH-04)
4. Public share link lets an account-less viewer see the full itinerary read-only. (AUTH-05)
5. Toggling sharing OFF makes the share link return 404 — enforced server-side (RLS), not UI-hidden. (AUTH-05)

## Waves

### Wave 1 — Auth foundation (04-01)  ✅ ALREADY DONE (commit a23e6ec, feat 01-02)
- `src/lib/supabase/client.ts` — browser client (createBrowserClient). ✅
- `src/lib/supabase/server.ts` — server client (createServerClient + cookies()). ✅
  (getUser() helper to be added in Wave 3 where API routes need it.)
- `src/lib/supabase/middleware.ts` + root `src/proxy.ts` — session refresh; skips when
  Supabase URL unconfigured (preserves Phase 03 anonymous flow). ✅

### Wave 2 — Auth UI + OAuth (04-02)  ✅ DONE
- `src/lib/validation/auth.ts` (+ test) — credentialsSchema (email+password, min 8).
- `src/components/auth/auth-form.tsx` — shared login/register form + Google OAuth button.
- `/login`, `/register` pages; `/auth/callback` (code→session exchange); `/auth/signout` (POST).
- `src/components/site-header.tsx` wired into layout — login/register vs. user email + 登出.

### Wave 3 — Save + List persistence (04-03)  ✅ DONE
- `src/lib/validation/itinerary.ts` (+ test) — save + update payload schemas.
- `POST/GET /api/itineraries` — owner-scoped save (itinerary→days→visits in a tx) + list.
- `GET/PATCH/DELETE /api/itineraries/:id` — load own / share toggle / delete.
- `src/lib/itinerary/serialize.ts` — loadItineraryContents() rebuilds OptimizeResult+resolvedPlaces.
- `src/components/save-itinerary-button.tsx` on results; `/itineraries` list; `/itineraries/:id` view.

### Wave 4 — Sharing (04-04)  ✅ DONE
- `PATCH /api/itineraries/:id` is_public toggle (returns share_token).
- `src/components/share-controls.tsx` — toggle + copyable link on the owner view.
- `/share/[token]` public read-only page; visibility enforced server-side (is_public ⇒ 404 if off).

## Verification (local, this session)
- `tsc --noEmit`: CLEAN across all Phase 04 code.
- `next build`: compiles all routes/components; fails ONLY on missing `lightningcss.win32-x64-msvc.node`
  (Linux/win32 native-binding gap — node_modules was installed for Linux; same root cause as the
  missing `next.cmd`/rolldown/swc bindings). Tests + full build to run in Linux/CI.
- Vitest could not run locally (missing `@rolldown/binding-win32-x64-msvc`); 3 new unit-test files
  added (auth + itinerary validation) to run in CI.

## Operator follow-ups (runtime, not code)
- Google OAuth (AUTH-03): create a Google Cloud OAuth client + enable the Google provider in
  Supabase Auth with redirect `<site>/auth/callback`. UI ships; live Google login needs this.
- Email confirmation: behavior depends on the Supabase project's "Confirm email" setting.

## Risks
- OAuth requires Google Cloud OAuth client + Supabase provider config (operator step) — UI ships
  but live Google login needs that console setup; document as a runtime/operator item.
- Saving must map Phase 03 in-memory result (ResolvedPlace + OptimizeResult) → relational rows;
  place_visits.place_id is the places.id UUID, not the Google place_id — join on resolve.
