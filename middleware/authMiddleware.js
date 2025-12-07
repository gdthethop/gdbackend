const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.userId).select('-password');

            if (!req.user) {
                console.error('❌ Auth failed: User not found for userId:', decoded.userId);
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            // Check Session Validation
            if (decoded.sessionId) {
                const session = await Session.findById(decoded.sessionId);
                if (!session || !session.isValid) {
                    console.error('❌ Auth failed: Invalid session for sessionId:', decoded.sessionId);
                    return res.status(401).json({ message: 'Session expired or invalid' });
                }
                // Optional: Update lastActive
                // session.lastActive = Date.now();
                // await session.save(); 
                // (Optimization: Don't await save every request, or use fire-and-forget)
            } else {
                // If we want to force all users to re-login to get a session:
                console.error('❌ Auth failed: Token missing sessionId');
                return res.status(401).json({ message: 'Not authorized, invalid session structure' });
            }

            next();
        } catch (error) {
            console.error('❌ Auth middleware error:', error.message);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        console.error('❌ Auth failed: No authorization header or invalid format');
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };
