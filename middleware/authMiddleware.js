const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Session = require('../models/Session');

/**
 * Express middleware — protects routes that require authentication.
 *
 * Validates the Bearer JWT from the Authorization header, then:
 *   1. Decodes the token and finds the associated user in the database
 *   2. Checks that the session embedded in the token is still valid (not revoked)
 *   3. Attaches the user document to req.user for downstream route handlers
 *
 * Returns 401 if the token is missing, invalid, expired, or the session was revoked.
 */
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('❌ Auth failed: No authorization header or invalid format');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the full user document (minus password) to the request
    req.user = await User.findById(decoded.userId).select('-password');
    if (!req.user) {
      console.error('❌ Auth failed: User not found for userId:', decoded.userId);
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Validate that the session embedded in the token has not been revoked
    const session = await Session.findById(decoded.sessionId);
    if (!session || !session.isValid) {
      console.error('❌ Auth failed: Invalid or revoked session:', decoded.sessionId);
      return res.status(401).json({ message: 'Session expired or invalid' });
    }

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };
