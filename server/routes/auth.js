const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const User     = require('../models/User');

const { generateAccessToken, generateRefreshToken, setCookieAndRespond } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { isEmailConfigured, verifyTransporter, sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'hirishi2020@gmail.com').toLowerCase();

const setRole = (userId, role) => User.updateOne({ _id: userId }, { $set: { role } });

// ── REGISTER ──────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

    const emailClean = email.toLowerCase().trim();
    if (await User.findOne({ email: emailClean })) return res.status(400).json({ error: 'Account exists' });

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
    console.log('✅ User registered:', emailClean);

    if (!isAdmin) {
      if (isEmailConfigured()) {
        console.log(`📧 [REGISTER] Sending verification email to ${emailClean} …`);
        try {
          await sendVerificationEmail(emailClean, name, rawToken);
          console.log(`✅ [REGISTER] Verification email dispatched to ${emailClean}`);
        } catch (e) {
          console.error(`❌ [REGISTER] Verification email FAILED for ${emailClean}:`, e.message);
          console.error('   Code :', e.code);
          console.error('   Stack:', e.stack);
        }
      } else {
        console.warn('⚠️  [REGISTER] Email not configured — skipping verification email for', emailClean);
      }
    }

    return res.status(201).json({
      success: true,
      message: isAdmin ? 'Admin account created' : 'Check email to verify',
      user: { _id: user._id, name, email: emailClean, role: user.role, isVerified: user.isVerified }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Register failed' });
  }
});

// ── VERIFY EMAIL ──────────────────────────────────────────
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

    console.log('✅ Email verified:', user.email);
    return res.json({ success: true, message: 'Email verified' });
  } catch (err) {
    console.error('Verify error:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    console.log('🔐 LOGIN ATTEMPT:', email, 'as', role);

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    if (!user) {
      console.log('❌ User not found:', emailClean);
      return res.status(401).json({ error: 'No account found' });
    }

    if (user.isBlocked) {
      console.log('❌ User blocked:', emailClean);
      return res.status(403).json({ error: 'Account blocked' });
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      console.log('❌ Wrong password:', emailClean);
      return res.status(401).json({ error: 'Wrong password' });
    }

    if (!user.isVerified) {
      console.log('❌ Not verified:', emailClean);
      return res.status(403).json({ error: 'Email not verified', notVerified: true });
    }

    const finalRole = emailClean === ADMIN_EMAIL ? 'admin' : (role || 'viewer');
    if (emailClean !== ADMIN_EMAIL) await setRole(user._id, finalRole);

    const accessToken = generateAccessToken(user._id, finalRole);
    const refreshToken = generateRefreshToken();

    await User.updateOne({ _id: user._id }, { $set: { refreshToken } });
    const updatedUser = await User.findById(user._id);

    console.log('✅ LOGIN SUCCESS:', emailClean, 'as', finalRole);
    return setCookieAndRespond(res, accessToken, refreshToken, updatedUser);

  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── FORGOT PASSWORD ───────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });
    if (!user) return res.json({ success: true, message: 'If email exists, reset link sent' });

    if (!isEmailConfigured()) return res.status(503).json({ error: 'Email service down' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.updateOne(
      { _id: user._id },
      { $set: { resetToken: hashedToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) } }
    );

    console.log(`📧 [FORGOT-PASSWORD] Sending reset email to ${emailClean} …`);
    try {
      await sendPasswordResetEmail(emailClean, user.name, rawToken);
      console.log(`✅ [FORGOT-PASSWORD] Reset email dispatched to ${emailClean}`);
    } catch (e) {
      console.error(`❌ [FORGOT-PASSWORD] Reset email FAILED for ${emailClean}:`, e.message);
      console.error('   Code :', e.code);
      console.error('   Stack:', e.stack);
    }

    return res.json({ success: true, message: 'Reset link sent' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ error: 'Failed' });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.password = password;
    await user.save();

    await User.updateOne({ _id: user._id }, { $unset: { resetToken: 1, resetTokenExpiry: 1 } });

    console.log('✅ Password reset:', user.email);
    return res.json({ success: true, message: 'Password reset' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ error: 'Reset failed' });
  }
});

// ── ME ────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    console.error('Me error:', err.message);
    return res.status(500).json({ error: 'Error' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $unset: { refreshToken: 1 } });
  } catch {}
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return res.json({ success: true, message: 'Logged out' });
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const emailClean = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: emailClean, _id: { $ne: req.user._id } });
    if (existingUser) return res.status(400).json({ error: 'Email already used' });

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name, email: emailClean } },
      { new: true }
    );

    console.log('✅ Profile updated:', emailClean);
    return res.json({ success: true, message: 'Profile updated', user: updatedUser });
  } catch (err) {
    console.error('Profile error:', err.message);
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) return res.status(401).json({ error: 'Wrong current password' });

    user.password = newPassword;
    await user.save();

    console.log('✅ Password changed:', user.email);
    return res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    console.error('Change password error:', err.message);
    return res.status(500).json({ error: 'Change failed' });
  }
});

router.delete('/account', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await User.findByIdAndDelete(req.user._id);

    console.log('✅ Account deleted:', user.email);

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    return res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    console.error('Delete account error:', err.message);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// ── EMAIL HEALTH CHECK ────────────────────────────────────
router.get('/email-health', async (req, res) => {
  const configured = isEmailConfigured();

  if (!configured) {
    return res.status(503).json({
      ok: false,
      configured: false,
      message: 'Email is not configured — EMAIL_USER or EMAIL_PASS env vars are missing',
    });
  }

  console.log('🩺 [EMAIL-HEALTH] Running SMTP verification check …');
  const smtpOk = await verifyTransporter().catch(() => false);

  if (smtpOk) {
    return res.json({
      ok: true,
      configured: true,
      smtp: 'connected',
      message: 'Email service is healthy and ready to send',
    });
  } else {
    return res.status(503).json({
      ok: false,
      configured: true,
      smtp: 'failed',
      message: 'Email is configured but SMTP connection verification failed — check credentials and Gmail App Password',
    });
  }
});

module.exports = router;
