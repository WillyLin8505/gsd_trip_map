import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase session cookies on every request.
 *
 * This is the standard @supabase/ssr middleware pattern. It must be called from
 * src/middleware.ts on every route to keep the session alive and propagate updated
 * auth tokens to subsequent server-side reads in Route Handlers and Server Components.
 *
 * Pattern: create a supabase client that can mutate the response cookies, call
 * getUser() to trigger a token refresh if needed, then return the response with
 * updated cookies set.
 *
 * Never import @supabase/auth-helpers-nextjs here — that package is deprecated.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session token if it has expired. This is a no-op if the session
  // is still valid. getUser() makes a network call to the Supabase auth server
  // to verify the token — do not substitute with session.user which can be stale.
  await supabase.auth.getUser();

  return supabaseResponse;
}
