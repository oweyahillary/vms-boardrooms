-- ═══════════════════════════════════════════════════════════════════════
--  V13 MIGRATION — Notifications
--  Run once in the Supabase SQL Editor, after v12. Additive & re-run safe.
-- ═══════════════════════════════════════════════════════════════════════

-- Event-driven notifications (visitor waiting, occurrence skipped, …).
-- Time-based alerts (starting soon / ending soon) are derived at read time,
-- so they are NOT stored here.
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,          -- visitor_waiting | occurrence_skipped | …
    title      TEXT NOT NULL,
    body       TEXT,
    link       TEXT,                   -- which app view to open
    meta       JSONB,
    read       BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
