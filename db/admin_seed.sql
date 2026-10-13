-- Run this in Supabase SQL Editor AFTER creating the admin_users table
-- This creates your first superadmin account
-- Password is: Admin@Vivo2024  (change after first login)

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

-- Insert superadmin (password: Admin@Vivo2024)
-- bcrypt hash of Admin@Vivo2024 with 10 rounds
INSERT INTO admin_users (name, email, password, role)
VALUES (
  'Administrator',
  'admin@vivofashiongroup.com',
  '$2b$10$rJ9jnlMGitCUv5Q1nQUyOeZoJ5Q1E2Vv2e9pq5Xy1P2NkFhLYfMOK',
  'superadmin'
) ON CONFLICT (email) DO NOTHING;
