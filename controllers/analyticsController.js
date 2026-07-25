const Video = require('../models/video');

/**
 * GET /api/analytics/dashboard  [protected]
 * Returns aggregate stats for the authenticated creator's channel:
 *   - totalVideos   — number of uploaded videos
 *   - totalViews    — sum of views across all videos
 *   - totalLikes    — sum of likes across all videos
 *   - totalDislikes — sum of dislikes across all videos
 *   - mostViewedVideo — the single video with the highest view count
 */
exports.getCreatorStats = async (req, res) => {
  try {
    const videos = await Video.find({ userId: req.user._id });

    const totalVideos    = videos.length;
    const totalViews     = videos.reduce((acc, v) => acc + (v.views    || 0), 0);
    const totalLikes     = videos.reduce((acc, v) => acc + (v.likes    || 0), 0);
    const totalDislikes  = videos.reduce((acc, v) => acc + (v.dislikes || 0), 0);
    const mostViewedVideo = videos.sort((a, b) => b.views - a.views)[0] || null;

    res.json({ totalVideos, totalViews, totalLikes, totalDislikes, mostViewedVideo });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
