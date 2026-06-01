const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const User     = require('../models/User');

const {
  generateAccessToken,
  generateRefreshToken,
  setCookieAndRespond,
} = require('../utils/jwt');

const { authenticate } = require('../middleware/auth');
const { isEmailConfigured, sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'hirishi2020@gmail.com').toLowerCase();

const setRole = (userId, role) =>
  User.updateOne({ _id: userId }, { $set: { role } });

// ── REGISTER ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }

    const emailClean = email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailClean });
    if (existing) {
      return res.status(400).json({ error: 'Account already exists.' });
    }

    const isAdmin = emailClean === ADMIN_EMAIL;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = new User({
      name,
      email: emailClean,
      password,
      role: isAdmin ? 'admin' : 'viewer',
      isVerified: isAdmin,
      verificationToken: isAdmin ? null : hashedToken,
      verificationTokenExpiry: isAdmin ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await user.save();

    if (!isAdmin && isEmailConfigured()) {
      try {
        await sendVerificationEmail(emailClean, name, rawToken);
      } catch (e) {
        console.log('Email send failed (non-fatal):', e.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: isAdmin ? 'Admin account created.' : 'Account created. Check email to verify.',
      user: { _id: user._id, name, email: emailClean, role: user.role, isVerified: user.isVerified }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Register failed.' });
  }
});

// ── VERIFY EMAIL ──────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    await User.updateOne(
      { _id: user._id },
      { $set: { isVerified: true }, $unset: { verificationToken: 1, verificationTokenExpiry: 1 } }
    );

    return res.json({ success: true, message: 'Email verified. You can now login.' });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ── LOGIN ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    if (!user) {
      return res.status(401).json({ error: 'No account found with this email' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: 'Account blocked' });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Wrong password' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Email not verified', notVerified: true });
    }

    const finalRole = emailClean === ADMIN_EMAIL ? 'admin' : (role || 'viewer');

    if (emailClean !== ADMIN_EMAIL) {
      await setRole(user._id, finalRole);
    }

    const accessToken = generateAccessToken(user._id, finalRole);
    const refreshToken = generateRefreshToken();

    await User.updateOne(
      { _id: user._id },
      { $set: { refreshToken } }
    );

    const updatedUser = await User.findById(user._id);

    console.log(`✅ LOGIN SUCCESS: ${emailClean} as ${finalRole}`);

    return setCookieAndRespond(res, accessToken, refreshToken, updatedUser);

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── FORGOT PASSWORD ─────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    if (!user) return res.json({ success: true, message: 'If email exists, reset link sent' });

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email service not available' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.updateOne(
      { _id: user._id },
      { $set: { resetToken: hashedToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) } }
    );

    try {
      await sendPasswordResetEmail(emailClean, user.name, rawToken);
    } catch (e) {
      console.log('Reset email failed:', e.message);
    }

    return res.json({ success: true, message: 'Reset link sent if email exists' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// ── RESET PASSWORD ──────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.password = password;
    await user.save();

    await User.updateOne({ _id: user._id }, { $unset: { resetToken: 1, resetTokenExpiry: 1 } });

    return res.json({ success: true, message: 'Password reset. You can now login.' });
  } catch (err) {
    return res.status(500).json({ error: 'Reset failed' });
  }
});

// ── ME ─────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: 'Error' });
  }
});

// ── LOGOUT ───────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $unset: { refreshToken: 1 } });
  } catch {}
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
