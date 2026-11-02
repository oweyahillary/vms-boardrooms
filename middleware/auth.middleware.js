const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

// Kiosk-only endpoints (today's visitor list, checkout). Passes with either
// the kiosk passcode (X-Kiosk-Key == KIOSK_KEY) or a logged-in user's token.
// If KIOSK_KEY is unset (local dev) the endpoints stay open.
exports.requireKiosk = (req, res, next) => {
  const expected = process.env.KIOSK_KEY;
  if (!expected) return next();

  const given = req.headers['x-kiosk-key'] || '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (crypto.timingSafeEqual(a, b)) return next();

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.admin = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      return next();
    } catch { /* fall through */ }
  }
  res.status(401).json({ error: 'Kiosk passcode required.' });
};

// Verify JWT token on protected routes
exports.requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised — no token provided.' });
  }
  try {
    const token = header.split(' ')[1];
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorised — invalid or expired token.' });
  }
};

// Role guard — pass allowed roles as array
exports.requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin.role)) {
    return res.status(403).json({ error: 'Forbidden — insufficient permissions.' });
  }
  next();
};
