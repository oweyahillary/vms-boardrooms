const jwt = require('jsonwebtoken');

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
