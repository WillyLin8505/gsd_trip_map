import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * OAuth + email-confirmation redirect target (AUTH-02 / AUTH-03).
 *
 * Supabase redirects here with a `code` query param after Google sign-in or after
 * the user clicks the email-confirmation link. We exchange that code for a session;
 * exchangeCodeForSession() sets the session cookies through the server client's
 * cookie adapter (writable in a Route Handler, unlike a Server Component).
 *
 * On success, redirect to `next` (defaults to home). On failure, send the user back
 * to /login with an error flag.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
