import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase server client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Uses @supabase/ssr createServerClient — NOT the deprecated @supabase/auth-helpers-nextjs.
 * Wires Next.js cookies() for cookie get/set so the auth session is available server-side.
 *
 * The anon key is used here; SUPABASE_SERVICE_ROLE_KEY is only used in Route Handlers
 * that explicitly need to bypass RLS (never exposed to the client bundle).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll() called from a Server Component — cookies cannot be set in RSC.
            // This is safe to ignore; the middleware.ts handles session refresh.
          }
        },
      },
    }
  );
}
