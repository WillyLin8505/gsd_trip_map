import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiUsage } from "@/lib/db/schema";

/** Daily cap on place lookups per subject (SC2). */
export const DAILY_LOOKUP_LIMIT = 50;

export interface RateLimitResult {
  allowed: boolean;
  /** Usage count for the subject AFTER this request would be counted. */
  count: number;
  limit: number;
}

/**
 * Pure decision: would counting `amount` more lookups exceed the limit?
 * Extracted for unit testing without a DB.
 */
export function wouldExceed(current: number, amount: number, limit: number): boolean {
  return current + amount > limit;
}

/**
 * Derive the rate-limit subject for a request: the user id when logged in,
 * otherwise the client IP from proxy headers (Vercel sets x-forwarded-for).
 */
export function subjectFor(userId: string | null, headers: Headers): string {
  if (userId) return `user:${userId}`;
  const xff = headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/** Today's date as YYYY-MM-DD (date column key). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check the subject's daily usage and, if allowed, count `amount` more lookups.
 * Rejected requests are NOT counted (so a single oversized request can't lock a
 * user out for the day). When no DB is configured (dev), never blocks.
 *
 * Note: the read-then-increment is not transactionally atomic — under heavy
 * concurrency the cap may be marginally exceeded. That's an acceptable trade-off
 * for a cost-control limiter (the goal is bounding abuse, not exact accounting).
 */
export async function checkAndCount(subject: string, amount = 1): Promise<RateLimitResult> {
  if (!db) return { allowed: true, count: 0, limit: DAILY_LOOKUP_LIMIT };

  // Fail OPEN: a limiter is a guardrail, not a hard dependency. If its store is
  // unreachable (DB down, table missing, DNS failure) we must not break the core
  // resolve flow — allow the request rather than 500.
  try {
    const day = today();
    const [existing] = await db
      .select({ count: apiUsage.count })
      .from(apiUsage)
      .where(and(eq(apiUsage.subject, subject), eq(apiUsage.day, day)))
      .limit(1);

    const current = existing?.count ?? 0;
    if (wouldExceed(current, amount, DAILY_LOOKUP_LIMIT)) {
      return { allowed: false, count: current, limit: DAILY_LOOKUP_LIMIT };
    }

    await db
      .insert(apiUsage)
      .values({ subject, day, count: amount })
      .onConflictDoUpdate({
        target: [apiUsage.subject, apiUsage.day],
        set: { count: sql`${apiUsage.count} + ${amount}` },
      });

    return { allowed: true, count: current + amount, limit: DAILY_LOOKUP_LIMIT };
  } catch {
    return { allowed: true, count: 0, limit: DAILY_LOOKUP_LIMIT };
  }
}
