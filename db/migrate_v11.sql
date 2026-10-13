-- ═══════════════════════════════════════════════════════════════════════
--  V11 MIGRATION — Boardrooms + Invited Users + Host↔Visitor linkage
--  Run this ONCE in the Supabase SQL Editor (after v10 is already applied).
--  It is additive and safe to re-run (IF NOT EXISTS / guarded blocks).
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
--  1. EXTEND admin_users  →  invitations + the new 'staff' role
-- ───────────────────────────────────────────────────────────────────────
--  Staff are ordinary invited employees (e.g. Steve). They can log in to
--  see their own visitors and book boardrooms, but do NOT get the VMS
--  admin dashboard. Existing roles (superadmin/manager/security/readonly)
--  are unchanged.

-- 1a. Allow the new role. The old CHECK constraint has to be replaced.
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('superadmin','manager','security','readonly','staff'));

-- 1b. Invited users have no password until they accept the invite,
--     so password must be allowed to be NULL.
ALTER TABLE admin_users ALTER COLUMN password DROP NOT NULL;

-- 1c. Invitation bookkeeping.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','invited','disabled'));
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS department    TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invite_token  TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invite_expires TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invited_by    INT REFERENCES admin_users(id);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invited_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_users_invite_token ON admin_users(invite_token);
-- Existing accounts created before this migration are already 'active' by default.


-- ───────────────────────────────────────────────────────────────────────
--  2. LINK a visit to the employee the visitor came to see
-- ───────────────────────────────────────────────────────────────────────
--  The kiosk currently stores host_name as free text. We keep that for
--  display/back-compat, but add a real FK so "Steve sees his visitors"
--  is an exact lookup, not fuzzy name matching.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS host_user_id INT REFERENCES admin_users(id);
CREATE INDEX IF NOT EXISTS idx_visits_host_user ON visits(host_user_id);


-- ───────────────────────────────────────────────────────────────────────
--  3. ROOMS
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    capacity       INT  NOT NULL,               -- max attendees
    min_attendees  INT  NOT NULL DEFAULT 1,     -- bookings below this are flagged
    purpose_tag    TEXT,                         -- e.g. 'Internal meetings'
    grace_minutes  INT  NOT NULL DEFAULT 30,     -- buffer after each meeting
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ───────────────────────────────────────────────────────────────────────
--  4. BOOKINGS
-- ───────────────────────────────────────────────────────────────────────
--  status is derived at read time (open/booked/ending/grace) from the
--  clock + times + the room's grace window — we do NOT store live status,
--  so no cron/background job is needed. The stored 'state' below only
--  tracks the booking's lifecycle (confirmed / cancelled / ended early).

CREATE TABLE IF NOT EXISTS bookings (
    id             SERIAL PRIMARY KEY,
    room_id        INT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    booked_by      INT NOT NULL REFERENCES admin_users(id),
    purpose        TEXT,
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ NOT NULL,
    attendee_count INT NOT NULL DEFAULT 1,
    state          TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (state IN ('confirmed','cancelled','ended_early')),
    ended_at       TIMESTAMPTZ,          -- set when someone "ends early"
    cancelled_at   TIMESTAMPTZ,
    -- Recurrence (Phase 3). Kept nullable now so the schema is stable later.
    recurrence_id  INT,                  -- groups occurrences of one series
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_booked_by ON bookings(booked_by);


-- ───────────────────────────────────────────────────────────────────────
--  5. BOOKING ATTENDEES  →  this is where "add the visitor as an attendee" lives
-- ───────────────────────────────────────────────────────────────────────
--  An attendee row can point at one of:
--    • a checked-in visit  (the visitor Steve is meeting)  → visit_id
--    • an internal user     (a colleague)                  → user_id
--    • a free-typed name    (external guest, no account)   → external_name

CREATE TABLE IF NOT EXISTS booking_attendees (
    id            SERIAL PRIMARY KEY,
    booking_id    INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    visit_id      INT REFERENCES visits(id),
    user_id       INT REFERENCES admin_users(id),
    external_name TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    -- exactly one identity kind per row
    CHECK (num_nonnulls(visit_id, user_id, external_name) = 1)
);

CREATE INDEX IF NOT EXISTS idx_battendees_booking ON booking_attendees(booking_id);
CREATE INDEX IF NOT EXISTS idx_battendees_visit   ON booking_attendees(visit_id);


-- ───────────────────────────────────────────────────────────────────────
--  6. Seed a few rooms so the dashboard isn't empty (edit/remove as needed)
-- ───────────────────────────────────────────────────────────────────────
INSERT INTO rooms (name, capacity, min_attendees, purpose_tag, grace_minutes)
SELECT * FROM (VALUES
    ('Amani room',   8,  3, 'Internal meetings', 30),
    ('Zawadi room', 12,  4, 'Client meetings',   30),
    ('Simba room',   6,  2, 'Quick syncs',       15)
) AS seed(name, capacity, min_attendees, purpose_tag, grace_minutes)
WHERE NOT EXISTS (SELECT 1 FROM rooms);

-- ═══════════════════════════════════════════════════════════════════════
--  Done. Tables: rooms, bookings, booking_attendees.
--  admin_users gained invitations + 'staff' role. visits gained host_user_id.
-- ═══════════════════════════════════════════════════════════════════════
