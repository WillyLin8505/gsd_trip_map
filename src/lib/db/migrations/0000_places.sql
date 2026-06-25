-- Migration: 0000_places.sql
-- Creates the shared place cache table.
-- This is the first and primary table for Phase 1.
-- Other tables (itineraries, itinerary_days, place_visits) are created in Plan 02.

-- Enable pgcrypto for gen_random_uuid() in standard PostgreSQL.
-- Supabase includes this by default — this line is idempotent.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS places (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id                        TEXT UNIQUE NOT NULL,
  display_name                    TEXT NOT NULL,
  address                         TEXT,
  lat                             DOUBLE PRECISION NOT NULL,
  lng                             DOUBLE PRECISION NOT NULL,
  opening_hours                   JSONB,        -- regularOpeningHours.periods[]
  utc_offset_minutes              INTEGER,      -- for timezone-correct scheduling
  place_types                     TEXT[],
  price_level                     INTEGER,
  rating                          NUMERIC(3,1),
  default_visit_duration_minutes  INTEGER,      -- derived from place_types heuristic
  hours_unknown                   BOOLEAN DEFAULT false,
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

-- Index on place_id for fast cache lookups
CREATE INDEX IF NOT EXISTS places_place_id_idx ON places(place_id);

-- Index on updated_at for efficient TTL queries (WHERE updated_at > NOW() - INTERVAL '30 days')
CREATE INDEX IF NOT EXISTS places_updated_at_idx ON places(updated_at);
