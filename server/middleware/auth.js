// ════════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE — JWT authenticate + role-based authorize
// ════════════════════════════════════════════════════════════════════════════

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const ACCESS_SECRET = process.env.JWT_SECRET || 'BeastCricket2026_AccessSecret_CHANGE_ME';

// ── authenticate ─────────────────────────────────────────────────────────────
// Reads the JWT from the Authorization header (Bearer <token>) or the
// httpOnly 'token' cookie. Attaches the full User document to req.user.
const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Authorization header (preferred for API clients / Next.js proxy)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // 2. Fallback: httpOnly cookie
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    // Verify and decode
    let decoded;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please log in again.', expired: true });
      }
      return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }

    // Load user from DB (ensures blocked/deleted users are rejected)
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user) {
      return res.status(401).json({ error: 'Account not found.' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ error: 'Account has been blocked. Contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('❌ authenticate middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication error.' });
  }
};

// ── authorize ─────────────────────────────────────────────────────────────────
// Role-based access control. Pass one or more allowed roles.
// Usage: router.get('/admin', authenticate, authorize('admin'), handler)
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }
  next();
};

module.exports = { authenticate, authorize };
