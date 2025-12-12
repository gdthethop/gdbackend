// routes/authRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const router = express.Router();

// POST register route
const { Types } = require('mongoose');

router.post('/register', async (req, res) => {

    const { name, email, password } = req.body;



    // Validate required fields
    if (!name || !email || !password) {

        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {

            return res.status(400).json({ error: 'User already exists' });
        }

        // Generate userId as a new ObjectId string
        const userId = new Types.ObjectId().toString();

        // Assign a rotating colored avatar to new users
        const avatarColors = [
            'https://i.pinimg.com/originals/bd/ee/4c/bdee4c328550aaf21aa9f43fd19e2136.png', // Red
            'https://i.pinimg.com/originals/b6/77/cd/b677cd1cde292f261166533d6fe75872.png', // Blue
            'https://i.pinimg.com/originals/1b/54/ef/1b54ef28c3109503487f551724af13aa.png', // Yellow
            'https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-88wkdmjop8eg057t.jpg', // Green
            'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png', // Classic
        ];

        // Get total user count to determine which avatar to assign
        const userCount = await User.countDocuments();
        const defaultAvatar = avatarColors[userCount % avatarColors.length];

        // Create new user with userId and default avatar
        const newUser = new User({ userId, name, email, password, profileIcon: defaultAvatar });
        await newUser.save();

        // Create Session (same as login)
        const session = new Session({
            user: newUser._id,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        await session.save();

        // Generate JWT token (Include sessionId)
        const token = jwt.sign({ userId: newUser._id, sessionId: session._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                _id: newUser._id,
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                profileIcon: newUser.profileIcon
            },
            token
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        // Return detailed error message for debugging
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

// POST login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;



    // Validate that both email and password are provided
    if (!email || !password) {

        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Query the database for the user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Compare passwords using comparePassword method
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Check for 2FA
        if (user.isTwoFactorEnabled) {
            const { token: twoFactorToken } = req.body;

            if (!twoFactorToken) {
                // Tell frontend to prompt for 2FA code
                // We don't issue the real JWT yet.
                // We could issue a temp token with limited scope, BUT for simplicity:
                // Frontend simply receives "requires2FA: true" and prompts user.
                // Then User resends /login with email, password, AND token.
                return res.json({ requires2FA: true, message: 'Please enter your 2FA code' });
            }

            // Verify the provided token
            const verified = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: twoFactorToken
            });

            if (!verified) {
                return res.status(400).json({ error: 'Invalid 2FA Code' });
            }
        }



        // Create Session
        const session = new Session({
            user: user._id,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        await session.save();

        // Generate JWT token (Includes sessionId)
        const token = jwt.sign({ userId: user._id, sessionId: session._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Return the response with token and user data
        res.json({
            token,
            user: {
                _id: user._id,
                id: user._id,
                name: user.name,
                email: user.email,
                profileIcon: user.profileIcon
            },
        });
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST forgot-password route
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({ message: 'If that email exists, a password reset link has been sent.' });
        }

        // Generate reset token (simple random string)
        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash the token before storing
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Set token and expiry (1 hour)
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/reset-password/${resetToken}`;

        // Send email (using nodemailer)
        const nodemailer = require('nodemailer');

        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER || 'noreply@gdplayer.com',
            to: user.email,
            subject: 'Password Reset Request - Gd Player',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #a80000;">Password Reset Request</h2>
                    <p>Hello ${user.name},</p>
                    <p>You requested to reset your password for your Gd Player account.</p>
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #a80000; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Reset Password</a>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="color: #666; word-break: break-all;">${resetUrl}</p>
                    <p><strong>This link will expire in 1 hour.</strong></p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">© 2025 Gd Player & Gd Enterprises. All rights reserved.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ message: 'Password reset email sent successfully!' });
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// POST reset-password route
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
        return res.status(400).json({ error: 'Password and confirm password are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    try {
        // Hash the token to compare with stored hash
        const crypto = require('crypto');
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find user with valid token and not expired
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Update password (will be hashed by pre-save hook)
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successful! You can now login with your new password.' });
    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// PUT update-profile route
router.put('/update-profile', async (req, res) => {
    const { email, name, profileIcon } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update fields if provided
        if (name) user.name = name;
        if (profileIcon !== undefined) user.profileIcon = profileIcon;

        await user.save();

        // Return updated user data (without password)
        res.json({
            message: 'Profile updated successfully',
            user: {
                _id: user._id,
                id: user._id,
                name: user.name,
                email: user.email,
                profileIcon: user.profileIcon
            }
        });
    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// 2FA Routes

// 1. Generate 2FA Secret & QR Code
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { protect } = require('../middleware/authMiddleware'); // Assuming we can use this

router.post('/2fa/generate', protect, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({
            name: `GdPlayer (${req.user.email})`
        });

        // Save secret to user (temporarily or permanently? Standard is permanently but disabled until verify)
        req.user.twoFactorSecret = secret.base32;
        await req.user.save();

        // Generate QR Code
        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) return res.status(500).json({ error: 'Error generating QR Code' });

            res.json({
                message: '2FA Secret generated',
                secret: secret.base32,
                qrCode: data_url
            });
        });
    } catch (error) {
        console.error('2FA Generate Error:', error);
        res.status(500).json({ error: 'Failed to generate 2FA secret' });
    }
});

// 2. Verify 2FA Token & Enable
router.post('/2fa/verify', protect, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    try {
        const verified = speakeasy.totp.verify({
            secret: req.user.twoFactorSecret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            req.user.isTwoFactorEnabled = true;
            await req.user.save();
            res.json({ message: 'Two-Factor Authentication enabled successfully!' });
        } else {
            res.status(400).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('2FA Verify Error:', error);
        res.status(500).json({ error: 'Failed to verify 2FA token' });
    }
});

// 3. Disable 2FA
router.post('/2fa/disable', protect, async (req, res) => {
    try {
        req.user.isTwoFactorEnabled = false;
        req.user.twoFactorSecret = undefined;
        await req.user.save();
        res.json({ message: 'Two-Factor Authentication disabled.' });
    } catch (error) {
        console.error('2FA Disable Error:', error);
        res.status(500).json({ error: 'Failed to disable 2FA' });
    }
});

// 4. Session Management Routes
router.get('/sessions', protect, async (req, res) => {
    try {
        const sessions = await Session.find({ user: req.user._id, isValid: true }).sort({ lastActive: -1 });
        // Identify current session
        // Note: req.user doesn't have sessionId, we need to pass it from middleware or decode token again
        // Actually, let's update middleware to attach sessionId to req if possible, 
        // OR just parse it from auth header here.
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.decode(token);
        const currentSessionId = decoded.sessionId;

        const sessionList = sessions.map(s => ({
            _id: s._id,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            lastActive: s.lastActive,
            createdAt: s.createdAt,
            isCurrent: s._id.toString() === currentSessionId
        }));

        res.json(sessionList);
    } catch (error) {
        console.error('Get Sessions Error:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

router.delete('/sessions/:id', protect, async (req, res) => {
    try {
        const sessionId = req.params.id;
        // Ensure user owns this session
        const session = await Session.findOne({ _id: sessionId, user: req.user._id });
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Revoke
        session.isValid = false; // Soft delete mechanism
        await session.save();
        // Or await Session.findByIdAndDelete(sessionId);

        res.json({ message: 'Session revoked' });
    } catch (error) {
        console.error('Revoke Session Error:', error);
        res.status(500).json({ error: 'Failed to revoke session' });
    }
});

module.exports = router;
