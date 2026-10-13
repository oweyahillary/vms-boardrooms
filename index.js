require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const visitorRoutes   = require('./routes/visitor.routes');
const adminRoutes     = require('./routes/admin.routes');
const boardroomRoutes = require('./routes/boardroom.routes');
const staffRoutes     = require('./routes/staff.routes');
const logger  = require('./utils/logger');
const db      = require('./db');

const app = express();

// ── Security / parsing ─────────────────────────────────
// Single-service (Option A): the frontend is served from THIS origin,
// so we no longer need wide-open CORS. Allow same-origin plus any extra
// origins listed in CORS_ORIGINS (comma-separated) for local dev.
const extraOrigins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: extraOrigins.length ? extraOrigins : true }));

// helmet with CSP disabled for now — the current HTML pages use inline
// scripts and external CDNs (Chart.js, Google Fonts). Re-enable a tuned
// CSP once the React build replaces the inline-script pages.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '15mb' }));

// Request logger
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url });
  next();
});

// ── API routes ─────────────────────────────────────────
app.use('/api/visitors',   visitorRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/boardrooms', boardroomRoutes);
app.use('/api/staff',      staffRoutes);

// Health check (ping '/' instead for keep-alive to avoid a DB hit)
app.get('/health', async (req, res) => {
  try {
    await db.healthCheck();
    res.json({ status: 'ok', server: 'running', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', server: 'running', database: 'unreachable', error: err.message });
  }
});

// ── Static frontend ────────────────────────────────────
// Serves public/index.html (kiosk), public/admin.html, and the unified
// React app. Same origin => the frontend calls the API with relative
// paths (/api/...) — no API_BASE to ever edit again.
const PUBLIC_DIR = path.join(__dirname, 'public');

// Legacy → unified app. The old vanilla /admin dashboard and the
// /boardrooms placeholder have been folded into the single React app at
// /app; both paths now redirect there. Declared BEFORE express.static so
// they win over any stale build directory still on disk.
app.get(['/admin', '/admin/'],           (req, res) => res.redirect('/app'));
app.get(['/boardrooms', '/boardrooms/'], (req, res) => res.redirect('/app'));

app.use(express.static(PUBLIC_DIR));

// The unified app is the React build under public/app/ (Vite output).
app.get(['/app', '/app/'], (req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'app', 'index.html')));

// ── Global error handler ───────────────────────────────
app.use((err, req, res, next) => {
  logger.error({ event: 'unhandled_error', error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
