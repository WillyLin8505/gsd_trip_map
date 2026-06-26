import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Resolve the Postgres connection string for the current runtime:
 * - Cloudflare (OpenNext): the Hyperdrive binding exposes a pooled connection
 *   string (env.HYPERDRIVE.connectionString). getCloudflareContext() throws
 *   outside a Cloudflare request, so we guard it.
 * - Node / Vercel / local dev: process.env.DATABASE_URL.
 * Returns null when neither is configured (dev/test without a DB).
 */
function resolveConnectionString(): string | null {
  try {
    const env = getCloudflareContext().env as
      | { HYPERDRIVE?: { connectionString?: string } }
      | undefined;
    const cs = env?.HYPERDRIVE?.connectionString;
    if (cs) return cs;
  } catch {
    // Not in a Cloudflare context — fall through to process.env.
  }
  return process.env.DATABASE_URL ?? null;
}

let cachedDb: NodePgDatabase | null = null;
let cachedConn: string | null = null;

/**
 * Returns the Drizzle client for the current request, or null when no DB is
 * configured.
 *
 * Uses node-postgres (pg) — Cloudflare's primary documented Hyperdrive driver,
 * which works on Workers under the `nodejs_compat` flag (postgres-js hangs on the
 * Workers runtime). On Cloudflare the connection string is the Hyperdrive local
 * proxy (no SSL); Hyperdrive itself does SSL to the Supabase origin. Off Cloudflare
 * the string is DATABASE_URL (Supabase pooler, sslmode in the URL).
 *
 * connectionTimeoutMillis bounds connection attempts so a bad origin fails fast
 * instead of hanging the Worker.
 */
export function getDb(): NodePgDatabase | null {
  const conn = resolveConnectionString();
  if (!conn) return null;
  if (cachedDb && cachedConn === conn) return cachedDb;
  const pool = new Pool({ connectionString: conn, max: 5, connectionTimeoutMillis: 10_000 });
  cachedDb = drizzle(pool);
  cachedConn = conn;
  return cachedDb;
}
