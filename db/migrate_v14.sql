-- ── Run this in Supabase SQL Editor (after v13) ───────
-- V14: lock down Supabase's auto-generated REST API + create storage bucket.
--
-- Supabase exposes every table in the public schema over its REST API to
-- anyone holding the anon key (which is designed to be public). Enabling
-- RLS with NO policies blocks that API entirely. The Express server is
-- unaffected: it connects through pg as the postgres role, which bypasses
-- RLS. Safe to re-run; also covers any tables added later if re-run.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ── Storage bucket for visitor photos / signatures ────
-- Public read (photo_url links are plain public URLs). Uploads come only
-- from the server using the service_role key, so no insert policy needed.
INSERT INTO storage.buckets (id, name, public)
VALUES ('visitor-files', 'visitor-files', true)
ON CONFLICT (id) DO NOTHING;
