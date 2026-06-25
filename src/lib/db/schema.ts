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
} from "drizzle-orm/pg-core";

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
