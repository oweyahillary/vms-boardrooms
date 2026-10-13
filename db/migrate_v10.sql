-- ── Run this in Supabase SQL Editor ───────────────────
-- V10 migration: adds admin_users table

CREATE TABLE IF NOT EXISTS admin_users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('superadmin','manager','security','readonly')),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  last_login  TIMESTAMP
);

-- ── CREATE YOUR FIRST SUPERADMIN ──────────────────────
-- Replace the values below, then run this block ONCE.
-- Password below is: Admin@Vivo2024 (change after first login)
-- bcrypt hash generated at: https://bcrypt.online (cost 10)
--
-- To generate your own hash:
-- 1. Go to https://bcrypt.online
-- 2. Enter your password, cost factor 10
-- 3. Copy the hash and paste below
--
INSERT INTO admin_users (name, email, password, role)
VALUES (
  'Super Admin',
  'admin@vivofashiongroup.com',
  '$2b$10$placeholder_replace_with_real_bcrypt_hash',
  'superadmin'
) ON CONFLICT (email) DO NOTHING;
