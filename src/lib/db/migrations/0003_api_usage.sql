-- Migration: 0003_api_usage.sql
-- Per-subject daily API-usage counter for rate limiting (Phase 05 / SC2).
-- subject = user_id (logged in) or client IP (anonymous); one row per (subject, day).

CREATE TABLE IF NOT EXISTS api_usage (
  subject  TEXT NOT NULL,
  day      DATE NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT api_usage_subject_day_key UNIQUE (subject, day)
);

-- Lookups/increments are always keyed by (subject, day).
CREATE INDEX IF NOT EXISTS api_usage_subject_day_idx ON api_usage(subject, day);

-- Writes happen only via the server (Drizzle/Postgres role). Enable RLS with no
-- policies so the anon/auth roles cannot read or tamper with usage counters.
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
