import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Resolve the Postgres connection string for the current runtime:
 * - Cloudflare (OpenNext): the Hyperdrive binding's pooled connection string.
 *   getCloudflareContext() throws outside a Cloudflare request, so we guard it.
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

/**
 * Returns the Drizzle client for the current request, or null when no DB is
 * configured.
 *
 * Per the OpenNext + Cloudflare guidance: do NOT keep a global/module-level DB
 * client on Workers — reusing a connection across requests hangs the runtime
 * ("code hung and would never generate a response"). React's cache() memoizes the
 * client per request, and `maxUses: 1` ensures each pooled connection is used once
 * and not carried into another request. Uses node-postgres (pg), Cloudflare's
 * documented Hyperdrive driver (works under nodejs_compat; postgres-js hangs).
 */
export const getDb = cache((): NodePgDatabase | null => {
  const conn = resolveConnectionString();
  if (!conn) return null;
  const pool = new Pool({ connectionString: conn, max: 5, maxUses: 1 });
  return drizzle(pool);
});
