require('dotenv').config();
const { Pool } = require('pg');
const logger   = require('./utils/logger');

// ── Timezone ───────────────────────────────────────
// Visit timestamps are TIMESTAMP (no zone) and "today" uses CURRENT_DATE,
// so Node and the DB session must agree on one zone. Default to Nairobi so
// "today" rolls over at local midnight, not 03:00 (servers run in UTC).
const APP_TZ = process.env.TZ || 'Africa/Nairobi';
process.env.TZ = APP_TZ;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase needs SSL; a local dev Postgres usually doesn't. Set PGSSL=off locally.
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },

  // ── Pool sizing ────────────────────────────────────
  // Supabase free tier allows 60 total connections.
  // Keep this low so you never exhaust the limit,
  // even if you later run two server instances.
  max: 10,               // max connections in the pool
  min: 2,                // keep 2 warm so first requests are fast
  idleTimeoutMillis: 30000,    // release a connection if idle for 30s
  connectionTimeoutMillis: 5000, // fail fast if DB unreachable (5s)
  allowExitOnIdle: false,  // keep the pool alive for a long-running server
});

// ── Connection health logging ──────────────────────
pool.on('connect', (client) => {
  // Queued before any caller's query on this client, so it always runs first.
  client.query(`SET TIME ZONE '${APP_TZ}'`).catch((err) =>
    logger.error({ event: 'db_set_timezone_failed', error: err.message }));
  logger.info({ event: 'db_connection_opened' });
});

pool.on('remove', () => {
  logger.info({ event: 'db_connection_closed' });
});

// ── Error handling ─────────────────────────────────
// Catches errors on idle connections (e.g. Supabase
// closing a connection after inactivity). Without this
// handler the process would crash.
pool.on('error', (err) => {
  logger.error({ event: 'db_pool_error', error: err.message });
});

// ── Graceful shutdown ──────────────────────────────
// When the server stops (Ctrl+C or process signal),
// drain all connections cleanly instead of cutting them.
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function shutdown(signal) {
  logger.info({ event: 'shutdown_initiated', signal });
  await pool.end();
  logger.info({ event: 'db_pool_closed' });
  process.exit(0);
}

// ── Health check helper ────────────────────────────
// Call this from your /health endpoint to verify
// the DB is actually reachable, not just the server.
pool.healthCheck = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
};

module.exports = pool;
