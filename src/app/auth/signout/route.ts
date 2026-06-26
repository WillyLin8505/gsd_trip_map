import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /auth/signout
 *
 * Signs the current user out and clears the session cookies, then redirects home.
 * Implemented as a POST route (not a GET link) so sign-out cannot be triggered by
 * a prefetch or a cross-site image/link.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
