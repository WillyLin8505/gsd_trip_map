import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated Supabase user for the current request, or null if unauthenticated.
 *
 * Usage in Route Handlers:
 *
 *   import { getUser } from "@/lib/auth/get-user";
 *
 *   export async function POST(request: Request) {
 *     const user = await getUser();
 *     if (!user) return new Response("Unauthorized", { status: 401 });
 *     // ... rest of handler
 *   }
 *
 * Implementation notes:
 * - Calls supabase.auth.getUser() which validates the session against the Supabase
 *   auth server. This is the correct approach — do NOT use session.user which can be
 *   stale or spoofed.
 * - Only uses the anon key via createClient() — never SUPABASE_SERVICE_ROLE_KEY.
 * - Returns null on any error (expired token, network issue, etc.) so Route Handlers
 *   can safely check `if (!user) return 401`.
 */
export async function getUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }
    return data.user ?? null;
  } catch {
    // createClient() throws when Supabase env is missing/misconfigured
    // (e.g. an invalid URL). Treat as anonymous so the public planner (AUTH-01)
    // keeps working instead of 500-ing every page that reads auth state.
    return null;
  }
}
