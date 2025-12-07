const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    user: {
        type: String, // Or mongoose.Schema.Types.ObjectId if you have Auth
        required: true,
        default: 'anonymous',
    },
    videos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video'
    }],
}, { timestamps: true });

module.exports = mongoose.model('Playlist', playlistSchema);
