-- ═══════════════════════════════════════════════════════════════════════
--  V15 MIGRATION — Meeting type (internal team vs. with a visitor)
--  Run after v14 (`npm run migrate`). Additive & re-run safe.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meeting_type TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE booking_series ADD COLUMN IF NOT EXISTS meeting_type TEXT NOT NULL DEFAULT 'internal';

DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_meeting_type_check
    CHECK (meeting_type IN ('internal','visitor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE booking_series ADD CONSTRAINT booking_series_meeting_type_check
    CHECK (meeting_type IN ('internal','visitor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
