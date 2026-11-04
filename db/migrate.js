/**
 * Run every migration in order against DATABASE_URL.
 * Usage: node db/migrate.js
 *
 * All files are idempotent, so re-running is safe. Each file runs in its
 * own transaction; the script stops at the first failure.
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('../db');

const FILES = [
  'init.sql',
  'migrate_v11.sql',
  'migrate_v12.sql',
  'migrate_v13.sql',
  'migrate_v14.sql', // Supabase-only (RLS + storage bucket)
  'migrate_v15.sql', // meeting type
];

(async () => {
  const client = await db.connect();
  try {
    for (const file of FILES) {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      process.stdout.write(`→ ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (e) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        console.error(`   ${e.message}`);
        process.exitCode = 1;
        return;
      }
    }
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);
    console.log(`✅ Done. Tables: ${rows.map(r => r.tablename).join(', ')}`);
  } finally {
    client.release();
    await db.end();
  }
})().catch((e) => {
  console.error('❌ Could not connect:', e.message);
  process.exit(1);
});
