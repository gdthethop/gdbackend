// routes/authRoutes.js
const express  = require('express');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Session  = require('../models/Session');
const { Types } = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const { protect } = require('../middleware/authMiddleware');

const router       = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Creates a new Session document and returns a signed JWT.
 * The JWT contains the userId and sessionId so sessions can be revoked.
 */
const createSessionAndToken = async (user, req) => {
  const session = new Session({
    user:      user._id,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
  });
  await session.save();

  const token = jwt.sign(
    { userId: user._id, sessionId: session._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return token;
};

/** Shared user response shape returned on login / register. */
const userPayload = (user) => ({
  _id:         user._id,
  id:          user._id,
  name:        user.name,
  email:       user.email,
  profileIcon: user.profileIcon,
});

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new user account with email + password.
 * Assigns a rotating default avatar and immediately returns a JWT.
 * Body: { name, email, password }
 */
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const avatarPool = [
      'https://i.pinimg.com/originals/bd/ee/4c/bdee4c328550aaf21aa9f43fd19e2136.png',
      'https://i.pinimg.com/originals/b6/77/cd/b677cd1cde292f261166533d6fe75872.png',
      'https://i.pinimg.com/originals/1b/54/ef/1b54ef28c3109503487f551724af13aa.png',
      'https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-88wkdmjop8eg057t.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png',
    ];
    const userCount    = await User.countDocuments();
    const defaultAvatar = avatarPool[userCount % avatarPool.length];

    const userId  = new Types.ObjectId().toString();
    const newUser = new User({ userId, name, email, password, profileIcon: defaultAvatar });
    await newUser.save();

    const token = await createSessionAndToken(newUser, req);

    res.status(201).json({ message: 'User registered successfully', user: userPayload(newUser), token });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Authenticates a user with email + password.
 * If the account has 2FA enabled, the first call returns { requires2FA: true }.
 * The client must then resend with the same credentials plus a `token` (TOTP code).
 * Body: { email, password, token? }
 */
router.post('/login', async (req, res) => {
  const { email, password, token: twoFactorToken } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

    // 2FA check
    if (user.isTwoFactorEnabled) {
      if (!twoFactorToken) {
        // Prompt the client to show the 2FA input
        return res.json({ requires2FA: true, message: 'Please enter your 2FA code' });
      }

      const verified = speakeasy.totp.verify({
        secret:   user.twoFactorSecret,
        encoding: 'base32',
        token:    twoFactorToken,
      });

      if (!verified) return res.status(400).json({ error: 'Invalid 2FA Code' });
    }

    const token = await createSessionAndToken(user, req);

    res.json({ token, user: userPayload(user) });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/google
 * Signs in or registers a user via Google OAuth.
 * Verifies the Google ID token, then upserts the user:
 *   - New user  → creates account using Google profile data
 *   - Existing email user → links their Google account
 *   - Returning Google user → logs in normally
 * Body: { credential }  (the Google ID token from the frontend)
 */
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Google credential is required' });

  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // First-time Google sign-in — create account
      const userId = new Types.ObjectId().toString();
      user = new User({
        userId,
        name,
        email,
        googleId,
        profileIcon: picture || 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png',
      });
      await user.save();
    } else if (!user.googleId) {
      // Existing email/password user signing in with Google — link accounts
      user.googleId = googleId;
      if (!user.profileIcon) user.profileIcon = picture;
      await user.save();
    }

    const token = await createSessionAndToken(user, req);

    res.status(200).json({ token, user: userPayload(user) });
  } catch (error) {
    console.error('❌ Google auth error:', error);
    res.status(401).json({ error: 'Google authentication failed', details: error.message });
  }
});

// ─── Password Reset ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/forgot-password
 * Generates a password-reset token, stores a hash in the database,
 * and emails a reset link to the user. The link expires in 1 hour.
 * Does not reveal whether the email exists (security best practice).
 * Body: { email }
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Return success to avoid leaking which emails are registered
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    const crypto      = require('crypto');
    const resetToken  = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken   = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/reset-password/${resetToken}`;

    const nodemailer  = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from:    process.env.EMAIL_USER,
      to:      user.email,
      subject: 'Password Reset Request - Gd Player',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #a80000;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested to reset your password for your Gd Player account.</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #a80000; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Reset Password</a>
          <p>Or copy this link: <span style="color: #666; word-break: break-all;">${resetUrl}</span></p>
          <p><strong>This link expires in 1 hour.</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">© 2025 Gd Player & Gd Enterprises. All rights reserved.</p>
        </div>
      `,
    });

    res.json({ message: 'Password reset email sent successfully!' });
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password/:token
 * Validates the reset token and updates the user's password.
 * The token in the URL is plaintext; the stored version is a SHA-256 hash.
 * Body: { password, confirmPassword }
 */
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword) return res.status(400).json({ error: 'Password and confirm password are required' });
  if (password !== confirmPassword)   return res.status(400).json({ error: 'Passwords do not match' });
  if (password.length < 6)            return res.status(400).json({ error: 'Password must be at least 6 characters long' });

  try {
    const crypto      = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    // The pre-save hook in User.js will hash the new password automatically
    user.password              = password;
    user.resetPasswordToken    = undefined;
    user.resetPasswordExpires  = undefined;
    await user.save();

    res.json({ message: 'Password reset successful! You can now login with your new password.' });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * PUT /api/auth/update-profile
 * Updates the name and/or profileIcon of an existing user.
 * Identified by email (does not require a JWT — used for profile edits from account page).
 * Body: { email, name?, profileIcon? }
 */
router.put('/update-profile', async (req, res) => {
  const { email, name, profileIcon } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (name)                    user.name        = name;
    if (profileIcon !== undefined) user.profileIcon = profileIcon;
    await user.save();

    res.json({ message: 'Profile updated successfully', user: userPayload(user) });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── Two-Factor Authentication ────────────────────────────────────────────────

/**
 * POST /api/auth/2fa/generate  [protected]
 * Generates a new TOTP secret for the user and returns a QR code data URL.
 * The secret is saved to the user but 2FA is not yet enabled (requires /2fa/verify).
 */
router.post('/2fa/generate', protect, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `GdPlayer (${req.user.email})` });
    req.user.twoFactorSecret = secret.base32;
    await req.user.save();

    QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) return res.status(500).json({ error: 'Error generating QR Code' });
      res.json({ message: '2FA Secret generated', secret: secret.base32, qrCode: data_url });
    });
  } catch (error) {
    console.error('2FA Generate Error:', error);
    res.status(500).json({ error: 'Failed to generate 2FA secret' });
  }
});

/**
 * POST /api/auth/2fa/verify  [protected]
 * Verifies a TOTP code against the user's stored secret and enables 2FA on success.
 * Body: { token }
 */
router.post('/2fa/verify', protect, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const verified = speakeasy.totp.verify({
      secret:   req.user.twoFactorSecret,
      encoding: 'base32',
      token,
    });

    if (!verified) return res.status(400).json({ error: 'Invalid token' });

    req.user.isTwoFactorEnabled = true;
    await req.user.save();
    res.json({ message: 'Two-Factor Authentication enabled successfully!' });
  } catch (error) {
    console.error('2FA Verify Error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA token' });
  }
});

/**
 * POST /api/auth/2fa/disable  [protected]
 * Disables 2FA and clears the stored TOTP secret for the authenticated user.
 */
router.post('/2fa/disable', protect, async (req, res) => {
  try {
    req.user.isTwoFactorEnabled = false;
    req.user.twoFactorSecret    = undefined;
    await req.user.save();
    res.json({ message: 'Two-Factor Authentication disabled.' });
  } catch (error) {
    console.error('2FA Disable Error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * GET /api/auth/sessions  [protected]
 * Returns all active sessions for the current user.
 * Marks the current session (from the request's JWT) with isCurrent: true.
 */
router.get('/sessions', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id, isValid: true }).sort({ lastActive: -1 });

    // Decode the token to find which session is the current one
    const token           = req.headers.authorization.split(' ')[1];
    const decoded         = jwt.decode(token);
    const currentSessionId = decoded.sessionId;

    const sessionList = sessions.map((s) => ({
      _id:        s._id,
      ipAddress:  s.ipAddress,
      userAgent:  s.userAgent,
      lastActive: s.lastActive,
      createdAt:  s.createdAt,
      isCurrent:  s._id.toString() === currentSessionId,
    }));

    res.json(sessionList);
  } catch (error) {
    console.error('Get Sessions Error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/:id  [protected]
 * Revokes (soft-deletes) a specific session by ID.
 * Users can only revoke their own sessions.
 */
router.delete('/sessions/:id', protect, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.isValid = false; // Soft-delete; the protect middleware will reject this session on next request
    await session.save();

    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error('Revoke Session Error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

module.exports = router;
