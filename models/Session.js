const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    ipAddress: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    isValid: {
        type: Boolean,
        default: true,
    },
    lastActive: {
        type: Date,
        default: Date.now,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '30d' // Auto-delete after 30 days of inactivity
    }
});

module.exports = mongoose.model('Session', sessionSchema, 'gd_sessions');
