import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getUser } from "@/lib/auth/get-user";
import { itineraries, itineraryDays, placeVisits } from "@/lib/db/schema";
import { loadItineraryContents } from "@/lib/itinerary/serialize";
import { updateItinerarySchema } from "@/lib/validation/itinerary";

type Params = { params: Promise<{ id: string }> };
type Db = NonNullable<ReturnType<typeof getDb>>;

/** Fetch one itinerary row scoped to the current user, or null. */
async function getOwnedRow(db: Db, id: string, userId: string) {
  const [row] = await db
    .select()
    .from(itineraries)
    .where(and(eq(itineraries.id, id), eq(itineraries.user_id, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * GET /api/itineraries/:id — load one of the current user's itineraries (AUTH-04).
 */
export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database is not configured" }, { status: 500 });
  }

  const { id } = await params;
  const row = await getOwnedRow(db, id, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loaded = await loadItineraryContents(row);
  return NextResponse.json(loaded);
}

/**
 * PATCH /api/itineraries/:id — toggle public sharing (AUTH-05).
 * Returns the share token so the client can build the /share/:token link.
 */
export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database is not configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }
  const parsed = updateItinerarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { id } = await params;
  const [updated] = await db
    .update(itineraries)
    .set({ is_public: parsed.data.isPublic, updated_at: new Date() })
    .where(and(eq(itineraries.id, id), eq(itineraries.user_id, user.id)))
    .returning({ is_public: itineraries.is_public, share_token: itineraries.share_token });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    isPublic: updated.is_public,
    shareToken: updated.share_token,
  });
}

/**
 * DELETE /api/itineraries/:id — delete one of the current user's itineraries.
 * Children (days, visits) are removed first since the schema declares no cascade.
 */
export async function DELETE(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "database is not configured" }, { status: 500 });
  }

  const { id } = await params;
  const row = await getOwnedRow(db, id, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.transaction(async (tx) => {
    const dayRows = await tx
      .select({ id: itineraryDays.id })
      .from(itineraryDays)
      .where(eq(itineraryDays.itinerary_id, id));
    const dayIds = dayRows.map((d) => d.id);
    if (dayIds.length > 0) {
      await tx.delete(placeVisits).where(inArray(placeVisits.itinerary_day_id, dayIds));
      await tx.delete(itineraryDays).where(eq(itineraryDays.itinerary_id, id));
    }
    await tx.delete(itineraries).where(eq(itineraries.id, id));
  });

  return NextResponse.json({ ok: true });
}
