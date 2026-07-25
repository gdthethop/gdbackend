const WatchHistory = require('../models/WatchHistory');

/**
 * POST /api/history  [protected]
 * Adds a video to the user's watch history, or updates its progress if already present.
 * Uses an upsert so re-watching a video updates the existing record rather than duplicating it.
 * Body: { videoId, progress?, completed? }
 */
exports.addToHistory = async (req, res) => {
  try {
    const { videoId, progress, completed } = req.body;
    if (!videoId) return res.status(400).json({ message: 'Video ID is required' });

    const historyItem = await WatchHistory.findOneAndUpdate(
      { user: req.user._id, video: videoId },
      {
        user:      req.user._id,
        video:     videoId,
        progress:  progress  || 0,
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

/**
 * GET /api/history  [protected]
 * Returns the full watch history for the authenticated user,
 * sorted by most recently watched and with full video details populated.
 */
exports.getHistory = async (req, res) => {
  try {
    const history = await WatchHistory.find({ user: req.user._id })
      .populate('video')
      .sort({ watchedAt: -1 });

    res.status(200).json(history);
  } catch (error) {
    console.error('Get History Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * DELETE /api/history  [protected]
 * Permanently deletes all watch history entries for the authenticated user.
 */
exports.clearHistory = async (req, res) => {
  try {
    await WatchHistory.deleteMany({ user: req.user._id });
    res.status(200).json({ message: 'History cleared' });
  } catch (error) {
    console.error('Clear History Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
