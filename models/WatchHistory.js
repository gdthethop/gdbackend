const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    video: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true,
    },
    watchedAt: {
        type: Date,
        default: Date.now,
    },
    progress: {
        type: Number, // Saved time in seconds
        default: 0,
    },
    completed: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Ensure a user has unique entry per video (or we update the existing one)
watchHistorySchema.index({ user: 1, video: 1 }, { unique: true });

module.exports = mongoose.model('WatchHistory', watchHistorySchema);
