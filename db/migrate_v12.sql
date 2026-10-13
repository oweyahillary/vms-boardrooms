-- ═══════════════════════════════════════════════════════════════════════
--  V12 MIGRATION — Recurring bookings
--  Run once in the Supabase SQL Editor, after v11. Additive & re-run safe.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The recurrence rule ─────────────────────────────────────────────
--  One row per recurring series. Individual meetings are still normal
--  rows in `bookings`, tagged with recurrence_id = this series' id.
CREATE TABLE IF NOT EXISTS booking_series (
    id             SERIAL PRIMARY KEY,
    room_id        INT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    booked_by      INT NOT NULL REFERENCES admin_users(id),
    purpose        TEXT,
    attendee_count INT NOT NULL DEFAULT 1,
    start_hm       TEXT NOT NULL,           -- 'HH:MM' (Kenya time)
    end_hm         TEXT NOT NULL,           -- 'HH:MM'
    days_of_week   INT[] NOT NULL,          -- 0=Sun … 6=Sat
    first_date     DATE NOT NULL,
    end_type       TEXT NOT NULL CHECK (end_type IN ('count','date','never')),
    end_count      INT,                     -- when end_type='count'
    end_date       DATE,                    -- when end_type='date'
    last_generated DATE,                    -- horizon already materialised (for 'never' top-up)
    cancelled_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_series_booked_by ON booking_series(booked_by);

-- ── 2. Tie occurrences to their series (recurrence_id already exists) ───
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bookings_recurrence_fk'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_recurrence_fk
      FOREIGN KEY (recurrence_id) REFERENCES booking_series(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. Allow occurrences to be marked 'skipped' (clashed at generation) ─
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_state_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_state_check
  CHECK (state IN ('confirmed','cancelled','ended_early','skipped'));

-- ═══════════════════════════════════════════════════════════════════════
--  Done. booking_series added; bookings.recurrence_id now FK'd; bookings
--  may be 'skipped'. Skipped rows never block other bookings (conflict
--  checks only consider state='confirmed').
-- ═══════════════════════════════════════════════════════════════════════
