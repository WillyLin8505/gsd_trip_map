import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js middleware — runs on every matched request before the page or Route Handler.
 *
 * Delegates to updateSession() which refreshes the Supabase session cookies so that
 * subsequent server-side auth checks (via getUser()) see a valid, non-expired session.
 *
 * The matcher excludes static assets and Next.js internals to avoid unnecessary work.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Any path ending in a common static extension (.png, .jpg, .svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
