-- ── VISITORS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitors (
    id         SERIAL PRIMARY KEY,
    full_name  TEXT NOT NULL,
    phone      TEXT,
    id_number  TEXT,
    email      TEXT,
    company    TEXT,
    vehicle    TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── VISITS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visits (
    id            SERIAL PRIMARY KEY,
    visitor_id    INT REFERENCES visitors(id),
    visit_type    TEXT,
    purpose       TEXT,
    host_name     TEXT,
    host_dept     TEXT,
    host_phone    TEXT,
    photo_url     TEXT,
    signature_url TEXT,
    check_in      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visits_checkin ON visits(check_in);

-- ── ADMIN USERS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('superadmin','manager','security','readonly')),
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);
