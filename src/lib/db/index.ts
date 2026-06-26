import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

let cachedDb: PostgresJsDatabase | null = null;
let cachedConn: string | null = null;

/**
 * Returns the Drizzle client for the current request, or null when no DB is
 * configured. Request-scoped because the connection string on Cloudflare comes
 * from a per-request binding; cached per connection string so Node/Vercel reuse
 * a single client.
 *
 * `prepare: false` keeps us compatible with poolers (Supabase pooler / Hyperdrive
 * transaction mode); `fetch_types: false` avoids an extra round trip on Workers.
 */
export function getDb(): PostgresJsDatabase | null {
  const conn = resolveConnectionString();
  if (!conn) return null;
  if (cachedDb && cachedConn === conn) return cachedDb;
  cachedDb = drizzle(postgres(conn, { prepare: false, fetch_types: false, max: 5 }));
  cachedConn = conn;
  return cachedDb;
}
