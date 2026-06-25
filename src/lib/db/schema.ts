import {
  pgTable,
  uuid,
  text,
  doublePrecision,
  jsonb,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Shared place cache (cross-user).
 *
 * Keyed on Google place_id (TEXT UNIQUE) — same place is never stored twice.
 * All Places API calls use cache-first: check this table before calling Google.
 * 30-day TTL enforced via updated_at (WHERE updated_at > NOW() - INTERVAL '30 days').
 *
 * RLS: SELECT open to all; INSERT/UPDATE restricted to service_role (Plan 02).
 *
 * Column notes:
 * - opening_hours: stored as JSONB regularOpeningHours.periods[] — NEVER freetext
 * - utc_offset_minutes: required for timezone-correct scheduling in Phase 2
 * - place_types: Google primary types array for visit duration lookup
 * - default_visit_duration_minutes: derived from place_types heuristic (Plan 03)
 * - hours_unknown: true when regularOpeningHours is absent — NEVER treat as always open
 */
export const places = pgTable("places", {
  id: uuid("id").primaryKey().defaultRandom(),
  place_id: text("place_id").unique().notNull(),
  display_name: text("display_name").notNull(),
  address: text("address"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  opening_hours: jsonb("opening_hours"),
  utc_offset_minutes: integer("utc_offset_minutes"),
  place_types: text("place_types").array(),
  price_level: integer("price_level"),
  rating: numeric("rating", { precision: 3, scale: 1 }),
  default_visit_duration_minutes: integer("default_visit_duration_minutes"),
  hours_unknown: boolean("hours_unknown").default(false),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;

/**
 * User itineraries.
 *
 * Owned by a single user (user_id → auth.users). Each itinerary spans total_days days.
 * city/region are stored for locationBias (today) and future cross-city clustering (v2)
 * without requiring a schema migration.
 *
 * share_token is pre-populated at row creation; is_public defaults to false.
 * Public share access is enforced by the itineraries_share_select RLS policy —
 * NOT just hidden in the UI.
 *
 * RLS: owner can CRUD; public share SELECT via is_public + share_token (Plan 02).
 */
export const itineraries = pgTable("itineraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  title: text("title").notNull(),
  total_days: integer("total_days").notNull(),
  city: text("city"),
  region: text("region"),
  share_token: uuid("share_token").unique().default(sql`gen_random_uuid()`),
  is_public: boolean("is_public").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Itinerary = typeof itineraries.$inferSelect;
export type NewItinerary = typeof itineraries.$inferInsert;

/**
 * Individual days within an itinerary.
 *
 * day_number starts at 1. date is optional (user may plan without specific dates).
 * UNIQUE(itinerary_id, day_number) prevents duplicate days.
 *
 * RLS: owner-scoped through parent itinerary (Plan 02).
 */
export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itinerary_id: uuid("itinerary_id").notNull(),
    day_number: integer("day_number").notNull(),
    date: date("date"),
  },
  (table) => ({
    uniqueItineraryDay: unique("itinerary_days_itinerary_id_day_number_key").on(
      table.itinerary_id,
      table.day_number
    ),
  })
);

export type ItineraryDay = typeof itineraryDays.$inferSelect;
export type NewItineraryDay = typeof itineraryDays.$inferInsert;

/**
 * Individual place visits within a day.
 *
 * Links to the shared places cache (place_id → places.id).
 * original_query is stored alongside for NOT_FOUND re-resolution (if a place is removed
 * from the Google index, we can retry with the original user query text).
 *
 * order_index determines the sequence within a day.
 * scheduled_start/scheduled_end are optional — the optimizer sets them in Phase 2.
 * travel_from_prev (minutes) and visit_duration_override let users or the optimizer
 * adjust the default visit duration derived from place_types.
 *
 * UNIQUE(itinerary_day_id, order_index) prevents position conflicts within a day.
 *
 * RLS: owner-scoped through itinerary_days → itineraries chain (Plan 02).
 */
export const placeVisits = pgTable(
  "place_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itinerary_day_id: uuid("itinerary_day_id").notNull(),
    place_id: uuid("place_id").notNull(),
    original_query: text("original_query"),
    order_index: integer("order_index").notNull(),
    scheduled_start: time("scheduled_start"),
    scheduled_end: time("scheduled_end"),
    travel_from_prev: integer("travel_from_prev"),
    visit_duration_override: integer("visit_duration_override"),
    notes: text("notes"),
  },
  (table) => ({
    uniqueDayOrder: unique("place_visits_itinerary_day_id_order_index_key").on(
      table.itinerary_day_id,
      table.order_index
    ),
  })
);

export type PlaceVisit = typeof placeVisits.$inferSelect;
export type NewPlaceVisit = typeof placeVisits.$inferInsert;
