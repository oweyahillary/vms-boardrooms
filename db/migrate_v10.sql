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

-- First superadmin: run `node create-admin.js <email> <password>` (see README).
