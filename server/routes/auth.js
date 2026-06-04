// ════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES — register, verify-email, login, logout, forgot/reset password
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const User    = require('../models/User');

const { generateAccessToken, generateRefreshToken, setCookieAndRespond } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const {
  isEmailConfigured,
  verifyTransporter,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('../utils/email');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'hirishi2020@gmail.com').toLowerCase();

const setRole = (userId, role) => User.updateOne({ _id: userId }, { $set: { role } });

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }

    const emailClean = email.toLowerCase().trim();

    if (await User.findOne({ email: emailClean })) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const isAdmin     = emailClean === ADMIN_EMAIL;
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = new User({
      name,
      email: emailClean,
      password,
      role:                    isAdmin ? 'admin' : 'viewer',
      isVerified:              isAdmin,
      verificationToken:       isAdmin ? null : hashedToken,
      verificationTokenExpiry: isAdmin ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await user.save();
    console.log('✅ User registered:', emailClean);

    if (!isAdmin && isEmailConfigured()) {
      try {
        await sendVerificationEmail(emailClean, name, rawToken);
        console.log('✅ Verification email sent to:', emailClean);
      } catch (e) {
        console.error('⚠️  Verification email failed:', e.message);
      }
    }

    return res.status(201).json({
      success:   true,
      message:   isAdmin ? 'Admin account created.' : 'Account created. Please check your email to verify.',
      emailSent: !isAdmin && isEmailConfigured(),
      user: { _id: user._id, name, email: emailClean, role: user.role, isVerified: user.isVerified },
    });
  } catch (err) {
    console.error('❌ Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token is required.' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      verificationToken:       hashedToken,
      verificationTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link. Please request a new one.' });
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { isVerified: true }, $unset: { verificationToken: 1, verificationTokenExpiry: 1 } }
    );

    console.log('✅ Email verified:', user.email);
    return res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
  } catch (err) {
    console.error('❌ Verify email error:', err.message);
    return res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── RESEND VERIFICATION ───────────────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    // Always return success to prevent email enumeration
    if (!user || user.isVerified) {
      return res.json({ success: true, message: 'If that email exists and is unverified, a new link has been sent.' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email service is not configured. Please contact support.' });
    }

    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          verificationToken:       hashedToken,
          verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }
    );

    try {
      await sendVerificationEmail(emailClean, user.name, rawToken);
    } catch (e) {
      console.error('⚠️  Resend verification email failed:', e.message);
      return res.status(503).json({ error: 'Failed to send verification email. Please try again later.' });
    }

    return res.json({ success: true, message: 'Verification email resent. Check your inbox.' });
  } catch (err) {
    console.error('❌ Resend verification error:', err.message);
    return res.status(500).json({ error: 'Failed to resend verification email.' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    console.log('🔐 LOGIN ATTEMPT:', email, 'as', role);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    if (!user) {
      console.log('❌ User not found:', emailClean);
      return res.status(401).json({ error: 'No account found with that email.' });
    }

    if (user.isBlocked) {
      console.log('❌ User blocked:', emailClean);
      return res.status(403).json({ error: 'Account has been blocked. Contact support.' });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      console.log('❌ Wrong password:', emailClean);
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    if (!user.isVerified) {
      console.log('❌ Not verified:', emailClean);
      return res.status(403).json({
        error:       'Email not verified. Please check your inbox and verify your email before logging in.',
        notVerified: true,
      });
    }

    const finalRole = emailClean === ADMIN_EMAIL ? 'admin' : (role || 'viewer');
    if (emailClean !== ADMIN_EMAIL) await setRole(user._id, finalRole);

    const accessToken  = generateAccessToken(user._id, finalRole);
    const refreshToken = generateRefreshToken();

    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });
    const updatedUser = await User.findById(user._id);

    console.log('✅ LOGIN SUCCESS:', emailClean, 'as', finalRole);
    return setCookieAndRespond(res, accessToken, refreshToken, updatedUser);
  } catch (err) {
    console.error('❌ Login error:', err.message);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

// ── ME ────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Me error:', err.message);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $unset: { refreshToken: 1 } });
  } catch {}
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return res.json({ success: true, message: 'Logged out.' });
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a password reset link has been sent.' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email service is not configured. Please contact support.' });
    }

    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.updateOne(
      { _id: user._id },
      { $set: { resetToken: hashedToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) } }
    );

    try {
      await sendPasswordResetEmail(emailClean, user.name, rawToken);
      console.log('✅ Password reset email sent to:', emailClean);
    } catch (e) {
      console.error('⚠️  Password reset email failed:', e.message);
      return res.status(503).json({ error: 'Failed to send password reset email. Please try again later.' });
    }

    return res.json({ success: true, message: 'Password reset email sent. Check your inbox.' });
  } catch (err) {
    console.error('❌ Forgot password error:', err.message);
    return res.status(500).json({ error: 'Failed to send password reset email.' });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetToken:       hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    user.password = password;
    await user.save();
    await User.updateOne({ _id: user._id }, { $unset: { resetToken: 1, resetTokenExpiry: 1 } });

    console.log('✅ Password reset:', user.email);
    return res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } catch (err) {
    console.error('❌ Reset password error:', err.message);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const emailClean = email.toLowerCase().trim();
    const existing = await User.findOne({ email: emailClean, _id: { $ne: req.user._id } });
    if (existing) return res.status(400).json({ error: 'Email is already in use.' });

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name, email: emailClean } },
      { new: true }
    );

    console.log('✅ Profile updated:', emailClean);
    return res.json({ success: true, message: 'Profile updated.', user: updatedUser });
  } catch (err) {
    console.error('❌ Profile update error:', err.message);
    return res.status(500).json({ error: 'Profile update failed.' });
  }
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.password = newPassword;
    await user.save();

    console.log('✅ Password changed:', user.email);
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('❌ Change password error:', err.message);
    return res.status(500).json({ error: 'Password change failed.' });
  }
});

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────────
router.delete('/account', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await User.findByIdAndDelete(req.user._id);
    console.log('✅ Account deleted:', user.email);

    res.clearCookie('token');
    res.clearCookie('refreshToken');
    return res.json({ success: true, message: 'Account deleted.' });
  } catch (err) {
    console.error('❌ Delete account error:', err.message);
    return res.status(500).json({ error: 'Account deletion failed.' });
  }
});

// ── EMAIL HEALTH CHECK ────────────────────────────────────────────────────────
router.get('/email-health', async (req, res) => {
  const configured = isEmailConfigured();

  if (!configured) {
    return res.status(503).json({
      ok:         false,
      configured: false,
      message:    'Email is not configured — EMAIL_USER or EMAIL_PASS env vars are missing.',
    });
  }

  console.log('🩺 [EMAIL-HEALTH] Running SMTP verification check …');
  const smtpOk = await verifyTransporter().catch(() => false);

  if (smtpOk) {
    return res.json({
      ok:         true,
      configured: true,
      smtp:       'connected',
      message:    'Email service is healthy and ready to send.',
    });
  } else {
    return res.status(503).json({
      ok:         false,
      configured: true,
      smtp:       'failed',
      message:    'Email is configured but SMTP connection verification failed — check credentials and Gmail App Password.',
    });
  }
});

module.exports = router;
