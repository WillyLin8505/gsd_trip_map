"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase browser client for use in Client Components.
 *
 * Uses @supabase/ssr createBrowserClient — NOT the deprecated @supabase/auth-helpers-nextjs.
 *
 * Only the anon key is used here — the service role key is NEVER exposed to the browser.
 * All protected API calls go through Next.js Route Handlers which validate the session
 * server-side via getUser().
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
