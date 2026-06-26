import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext → Cloudflare Workers configuration.
 *
 * Default config runs the Next.js server on a Cloudflare Worker with the
 * nodejs_compat flag (set in wrangler.jsonc). Incremental cache / queues can be
 * added later via R2/KV/D1 if needed; the default in-Worker behavior is fine for v1.
 */
export default defineCloudflareConfig();
