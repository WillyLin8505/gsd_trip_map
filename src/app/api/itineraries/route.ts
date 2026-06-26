import { NextRequest, NextResponse } from "next/server";
import { inArray, eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getUser } from "@/lib/auth/get-user";
import { itineraries, itineraryDays, placeVisits, places } from "@/lib/db/schema";
import { saveItinerarySchema } from "@/lib/validation/itinerary";

/**
 * POST /api/itineraries — save an itinerary for the current user (AUTH-04).
 * GET  /api/itineraries — list the current user's itineraries (AUTH-04).
 *
 * Ownership enforcement: the app connects via Drizzle using the Postgres role
 * (DATABASE_URL), which bypasses RLS — so ownership MUST be enforced in code here:
 * writes stamp user_id from getUser(); reads filter by user_id. Never trust a
 * client-supplied user id.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: database is not configured" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = saveItinerarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Map Google place_id → places.id (UUID). Every visited place must already be in
  // the shared cache (it was resolved/optimized before saving).
  const googleIds = Array.from(
    new Set(data.days.flatMap((d) => d.visits.map((v) => v.placeId)))
  );
  const placeRows = googleIds.length
    ? await db
        .select({ id: places.id, place_id: places.place_id })
        .from(places)
        .where(inArray(places.place_id, googleIds))
    : [];
  const idByGoogleId = new Map(placeRows.map((r) => [r.place_id, r.id]));

  const missing = googleIds.filter((g) => !idByGoogleId.has(g));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Some places are not resolved — resolve them before saving", details: missing },
      { status: 422 }
    );
  }

  const newId = await db.transaction(async (tx) => {
    const [itinerary] = await tx
      .insert(itineraries)
      .values({
        user_id: user.id,
        title: data.title,
        total_days: data.totalDays,
        city: data.city ?? null,
        region: data.region ?? null,
      })
      .returning({ id: itineraries.id });

    for (const day of data.days) {
      const [dayRow] = await tx
        .insert(itineraryDays)
        .values({ itinerary_id: itinerary.id, day_number: day.dayNumber })
        .returning({ id: itineraryDays.id });

      if (day.visits.length > 0) {
        await tx.insert(placeVisits).values(
          day.visits.map((v) => ({
            itinerary_day_id: dayRow.id,
            place_id: idByGoogleId.get(v.placeId)!,
            order_index: v.orderIndex,
            scheduled_start: v.scheduledStart ?? null,
            scheduled_end: v.scheduledEnd ?? null,
            travel_from_prev: v.travelFromPrev ?? null,
          }))
        );
      }
    }

    return itinerary.id;
  });

  return NextResponse.json({ id: newId }, { status: 201 });
}

export async function GET(): Promise<NextResponse> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error: database is not configured" },
      { status: 500 }
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

  return NextResponse.json(rows);
}
