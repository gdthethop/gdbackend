const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['subscription', 'like', 'comment', 'system'],
        default: 'system'
    },
    message: {
        type: String,
        required: true
    },
    link: {
        type: String // URL to redirect to (e.g., /video/xyz)
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema, 'gd_notifications');
