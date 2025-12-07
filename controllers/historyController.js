const WatchHistory = require('../models/WatchHistory');
const Video = require('../models/Video');

// Add or Update History
exports.addToHistory = async (req, res) => {
    try {
        const { videoId, progress, completed } = req.body;

        if (!videoId) {
            return res.status(400).json({ message: 'Video ID is required' });
        }

        // Upsert: Update if exists, Insert if not
        const historyItem = await WatchHistory.findOneAndUpdate(
            { user: req.user._id, video: videoId },
            {
                user: req.user._id,
                video: videoId,
                progress: progress || 0,
                completed: completed || false,
                watchedAt: Date.now(),
            },
            { new: true, upsert: true }
        );

        res.status(200).json(historyItem);
    } catch (error) {
        console.error('Add History Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get User History
exports.getHistory = async (req, res) => {
    try {
        const history = await WatchHistory.find({ user: req.user._id })
            .populate('video') // Populate video details
            .sort({ watchedAt: -1 });

        res.status(200).json(history);
    } catch (error) {
        console.error('Get History Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Clear History
exports.clearHistory = async (req, res) => {
    try {
        await WatchHistory.deleteMany({ user: req.user._id });
        res.status(200).json({ message: 'History cleared' });
    } catch (error) {
        console.error('Clear History Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
