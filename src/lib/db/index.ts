import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// db is null when DATABASE_URL is not configured (dev/test without Supabase).
// Route handlers that write to the cache must check `db` before using it.
function createDb() {
  if (!process.env.DATABASE_URL) return null;
  return drizzle(postgres(process.env.DATABASE_URL));
}

export const db = createDb();
