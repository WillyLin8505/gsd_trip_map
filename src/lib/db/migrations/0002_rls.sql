-- Migration: 0002_rls.sql
-- Enables Row Level Security on all four tables and creates the canonical policies.
-- Depends on: 0000_places.sql, 0001_itineraries.sql.
--
-- Policy name conventions match RESEARCH.md exactly so downstream references are stable.
-- All policies use PERMISSIVE (default) mode.

-- ============================================================
-- places: shared cache — readable by all, writable by service_role only
-- ============================================================

ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- Anyone (authenticated or anonymous) can read the shared place cache.
CREATE POLICY "places_select_all" ON places
  FOR SELECT
  USING (true);

-- Only the server (service_role) may insert new places into the cache.
-- application code calling via anon/user token cannot write directly.
CREATE POLICY "places_insert_service" ON places
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Only the server (service_role) may update existing cache entries.
CREATE POLICY "places_update_service" ON places
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- ============================================================
-- itineraries: owner CRUD + public share SELECT
-- ============================================================

ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;

-- The owning user can SELECT, INSERT, UPDATE, and DELETE their own itineraries.
CREATE POLICY "itineraries_owner" ON itineraries
  USING (auth.uid() = user_id);

-- Anyone can SELECT an itinerary when is_public = true and share_token is set.
-- This is enforced at the DB layer, not just hidden in UI.
CREATE POLICY "itineraries_share_select" ON itineraries
  FOR SELECT
  USING (is_public = true AND share_token IS NOT NULL);

-- ============================================================
-- itinerary_days: owner-scoped through parent itinerary
-- ============================================================

ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;

-- Users can only access days that belong to their own itineraries.
CREATE POLICY "itinerary_days_owner" ON itinerary_days
  USING (
    itinerary_id IN (
      SELECT id FROM itineraries WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- place_visits: owner-scoped through itinerary_days → itineraries chain
-- ============================================================

ALTER TABLE place_visits ENABLE ROW LEVEL SECURITY;

-- Users can only access visits that belong to days of their own itineraries.
CREATE POLICY "place_visits_owner" ON place_visits
  USING (
    itinerary_day_id IN (
      SELECT d.id
      FROM itinerary_days d
      JOIN itineraries i ON i.id = d.itinerary_id
      WHERE i.user_id = auth.uid()
    )
  );
