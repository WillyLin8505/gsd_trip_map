-- Migration: 0001_itineraries.sql
-- Creates the itineraries, itinerary_days, and place_visits tables.
-- Depends on: 0000_places.sql (places table must exist for the place_visits FK).
-- RLS policies are in 0002_rls.sql — do not add them here.
--
-- auth.users is a Supabase-managed table; no DDL is needed for it.

CREATE TABLE IF NOT EXISTS itineraries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  total_days   INTEGER NOT NULL,
  city         TEXT,             -- for locationBias + future cross-city clustering
  region       TEXT,
  share_token  UUID UNIQUE DEFAULT gen_random_uuid(),
  is_public    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Index to look up all itineraries for a user quickly
CREATE INDEX IF NOT EXISTS itineraries_user_id_idx ON itineraries(user_id);

CREATE TABLE IF NOT EXISTS itinerary_days (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id  UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number    INTEGER NOT NULL,
  date          DATE,
  UNIQUE(itinerary_id, day_number)
);

-- Index for fast day lookups by parent itinerary
CREATE INDEX IF NOT EXISTS itinerary_days_itinerary_id_idx ON itinerary_days(itinerary_id);

CREATE TABLE IF NOT EXISTS place_visits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id          UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  place_id                  UUID NOT NULL REFERENCES places(id),
  original_query            TEXT,   -- stored for NOT_FOUND re-resolution
  order_index               INTEGER NOT NULL,
  scheduled_start           TIME,
  scheduled_end             TIME,
  travel_from_prev          INTEGER,    -- travel time in minutes from previous visit
  visit_duration_override   INTEGER,    -- user override of default_visit_duration_minutes
  notes                     TEXT,
  UNIQUE(itinerary_day_id, order_index)
);

-- Index for fast visit lookups by day
CREATE INDEX IF NOT EXISTS place_visits_itinerary_day_id_idx ON place_visits(itinerary_day_id);

-- Index for fast reverse lookup: which days/itineraries include a given place
CREATE INDEX IF NOT EXISTS place_visits_place_id_idx ON place_visits(place_id);
