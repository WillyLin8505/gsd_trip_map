import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth/get-user";
import { itineraries } from "@/lib/db/schema";
import { loadItineraryContents } from "@/lib/itinerary/serialize";
import { ResultsLayout } from "@/components/results-layout";
import { ShareControls } from "@/components/share-controls";

/**
 * /itineraries/:id — view a saved itinerary (AUTH-04) with sharing controls (AUTH-05).
 * Owner-scoped: a non-owner (or anonymous user) cannot load it here.
 */
export default async function SavedItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!db) notFound();

  const { id } = await params;
  const [row] = await db
    .select()
    .from(itineraries)
    .where(and(eq(itineraries.id, id), eq(itineraries.user_id, user.id)))
    .limit(1);

  if (!row) notFound();

  const loaded = await loadItineraryContents(row);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{loaded.title}</h1>
          <p className="text-sm text-muted-foreground">
            {loaded.city ? `${loaded.city} · ` : ""}
            {loaded.totalDays} 天
          </p>
        </div>
        <Link href="/itineraries" className="text-sm underline text-muted-foreground">
          ← 我的行程
        </Link>
      </div>

      <ShareControls
        itineraryId={loaded.id}
        initialIsPublic={loaded.isPublic}
        shareToken={loaded.shareToken}
      />

      <ResultsLayout itinerary={loaded.itinerary} resolvedPlaces={loaded.resolvedPlaces} />
    </main>
  );
}
