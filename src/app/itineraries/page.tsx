import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getUser } from "@/lib/auth/get-user";
import { itineraries } from "@/lib/db/schema";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * /itineraries — list the current user's saved itineraries (AUTH-04).
 * Redirects anonymous users to /login.
 */
export default async function ItinerariesPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/itineraries");
  const db = getDb();
  if (!db) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-muted-foreground">資料庫尚未設定。</p>
      </main>
    );
  }

  const rows = await db
    .select({
      id: itineraries.id,
      title: itineraries.title,
      total_days: itineraries.total_days,
      city: itineraries.city,
      is_public: itineraries.is_public,
      created_at: itineraries.created_at,
    })
    .from(itineraries)
    .where(eq(itineraries.user_id, user.id))
    .orderBy(desc(itineraries.created_at));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">我的行程</h1>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>還沒有儲存的行程</CardTitle>
            <CardDescription>
              <Link href="/" className="underline">
                回首頁規劃一份行程
              </Link>
              ，最佳化後即可儲存。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/itineraries/${r.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {r.title}
                      {r.is_public && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-normal text-emerald-700">
                          已分享
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {r.city ? `${r.city} · ` : ""}
                      {r.total_days} 天
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
