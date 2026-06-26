import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { itineraries } from "@/lib/db/schema";
import { loadItineraryContents } from "@/lib/itinerary/serialize";
import { ResultsLayout } from "@/components/results-layout";

/**
 * /share/:token — public, read-only view of a shared itinerary (AUTH-05).
 *
 * No authentication required. Visibility is enforced server-side: the query
 * requires is_public = true, so a private (or toggled-off) itinerary returns 404
 * (SC5 — not merely hidden in the UI).
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = getDb();
  if (!db) notFound();

  const [row] = await db
    .select()
    .from(itineraries)
    .where(and(eq(itineraries.share_token, token), eq(itineraries.is_public, true)))
    .limit(1);

  if (!row) notFound();

  const loaded = await loadItineraryContents(row);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{loaded.title}</h1>
        <p className="text-sm text-muted-foreground">
          {loaded.city ? `${loaded.city} · ` : ""}
          {loaded.totalDays} 天 · 共享行程（唯讀）
        </p>
      </div>

      <ResultsLayout itinerary={loaded.itinerary} resolvedPlaces={loaded.resolvedPlaces} />
    </main>
  );
}
