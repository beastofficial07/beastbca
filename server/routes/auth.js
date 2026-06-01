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
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const isAdmin = emailClean === ADMIN_EMAIL;
    const role    = isAdmin ? 'admin' : 'viewer';

    // Generate a secure verification token (raw hex, store hashed)
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = new User({
      name,
      email: emailClean,
      password,
      role,
      // Admin accounts are auto-verified; everyone else must verify email
      isVerified:              isAdmin,
      verificationToken:       isAdmin ? null : hashedToken,
      verificationTokenExpiry: isAdmin ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await user.save();

    // Send verification email (non-blocking — don't fail registration if email fails)
    if (!isAdmin && isEmailConfigured()) {
      try {
        console.log('📧 Sending verification email to:', emailClean);
        await sendVerificationEmail(emailClean, name, rawToken);
        console.log('✅ Verification email sent successfully');
      } catch (emailErr) {
        console.error('⚠️ Verification email failed to send:', emailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: isAdmin
        ? 'Admin account created.'
        : 'Account created. Please check your email to verify your account.',
      emailSent: !isAdmin && isEmailConfigured(),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      }
    });

  } catch (err) {
    console.log("❌ REGISTER ERROR:", err);
    return res.status(500).json({ error: 'Register failed.' });
  }
});


// ── VERIFY EMAIL ──────────────────────────────────────
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

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
      {
        $set:   { isVerified: true },
        $unset: { verificationToken: 1, verificationTokenExpiry: 1 },
      }
    );

    console.log('✅ Email verified for:', user.email);

    return res.json({ success: true, message: 'Email verified successfully. You can now log in.' });

  } catch (err) {
    console.log("❌ VERIFY EMAIL ERROR:", err);
    return res.status(500).json({ error: 'Verification failed.' });
  }
});


// ── RESEND VERIFICATION EMAIL ─────────────────────────
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

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
      console.log('📧 Resending verification email to:', emailClean);
      await sendVerificationEmail(emailClean, user.name, rawToken);
      console.log('✅ Verification email resent');
    } catch (emailErr) {
      console.error('⚠️ Resend verification email failed:', emailErr.message);
    }

    return res.json({ success: true, message: 'Verification email resent. Check your inbox.' });

  } catch (err) {
    console.log("❌ RESEND VERIFICATION ERROR:", err);
    return res.status(500).json({ error: 'Failed to resend verification email.' });
  }
});


// ── LOGIN ───────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    console.log('🔐 LOGIN ATTEMPT:', email, 'as role:', role);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailClean = email.toLowerCase().trim();

    const user = await User.findOne({ email: emailClean });

    if (!user) {
      console.log('❌ User not found:', emailClean);
      return res.status(401).json({ error: 'No account found.' });
    }

    console.log('✅ User found:', user.email);
    console.log('   Verified:', user.isVerified);
    console.log('   Blocked:', user.isBlocked);

    if (user.isBlocked) {
      console.log('❌ User is blocked:', emailClean);
      return res.status(403).json({ error: 'Account is blocked. Contact support.' });
    }

    const ok = await user.comparePassword(password);

    if (!ok) {
      console.log('❌ Wrong password for:', emailClean);
      return res.status(401).json({ error: 'Wrong password.' });
    }

    // Block login if email is not verified
    if (!user.isVerified) {
      console.log('❌ Email not verified:', emailClean);
      return res.status(403).json({
        error: 'Email not verified. Please check your inbox and verify your email before logging in.',
        notVerified: true,
      });
    }

    const finalRole = emailClean === ADMIN_EMAIL ? 'admin' : role;

    if (emailClean !== ADMIN_EMAIL) {
      await setRole(user._id, role);
    }

    const accessToken  = generateAccessToken(user._id, finalRole);
    const refreshToken = generateRefreshToken();

    await User.updateOne(
      { _id: user._id },
      { $set: { refreshToken } }
    );

    const updatedUser = await User.findById(user._id);

    console.log('✅ LOGIN SUCCESS:', emailClean, 'role:', finalRole);

    return setCookieAndRespond(res, accessToken, refreshToken, updatedUser);

  } catch (err) {
    console.log("❌ LOGIN ERROR:", err);
    console.log("   Stack:", err.stack);
    return res.status(500).json({ error: 'Login failed.' });
  }
});


// ── FORGOT PASSWORD ─────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const emailClean = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailClean });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email service is not configured. Please contact support.' });
    }

    // Generate reset token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          resetToken: hashedToken,
          resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      }
    );

    // Send reset email
    try {
      console.log('📧 Sending password reset email to:', emailClean);
      await sendPasswordResetEmail(emailClean, user.name, rawToken);
      console.log('✅ Password reset email sent');
    } catch (emailErr) {
      console.error('⚠️ Password reset email failed to send:', emailErr.message);
    }

    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

  } catch (err) {
    console.log("❌ FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ error: 'Failed to process forgot password request.' });
  }
});


// ── RESET PASSWORD ──────────────────────────────────────
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
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Update password
    user.password = password;
    await user.save();

    // Clear reset token
    await User.updateOne(
      { _id: user._id },
      {
        $unset: { resetToken: 1, resetTokenExpiry: 1 },
      }
    );

    console.log('✅ Password reset successfully for:', user.email);

    return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (err) {
    console.log("❌ RESET PASSWORD ERROR:", err);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});


// ── ME (GET CURRENT USER) ─────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });

  } catch (err) {
    console.log("❌ ME ERROR:", err);
    return res.status(500).json({ error: 'Server error' });
  }
});


// ── UPDATE PROFILE ──────────────────────────────────────
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const emailClean = email.toLowerCase().trim();

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ email: emailClean, _id: { $ne: req.user._id } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name, email: emailClean } },
      { new: true }
    );

    console.log('✅ Profile updated for:', updatedUser.email);

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      }
    });

  } catch (err) {
    console.log("❌ UPDATE PROFILE ERROR:", err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});


// ── CHANGE PASSWORD ─────────────────────────────────────
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
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    console.log('✅ Password changed for:', user.email);

    return res.json({
      success: true,
      message: 'Password changed successfully.'
    });

  } catch (err) {
    console.log("❌ CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});


// ── DELETE ACCOUNT ──────────────────────────────────────
router.delete('/account', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    console.log('✅ Account deleted for:', user.email);

    // Clear cookies
    res.clearCookie('token');
    res.clearCookie('refreshToken');

    return res.json({
      success: true,
      message: 'Account deleted successfully.'
    });

  } catch (err) {
    console.log("❌ DELETE ACCOUNT ERROR:", err);
    return res.status(500).json({ error: 'Failed to delete account.' });
  }
});


// ── LOGOUT ───────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $unset: { refreshToken: 1 } }
    );
  } catch {}

  res.clearCookie('token');
  res.clearCookie('refreshToken');

  return res.json({ success: true, message: 'Logged out successfully.' });
});


module.exports = router;
