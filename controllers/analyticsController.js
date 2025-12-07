const Video = require('../models/Video');

exports.getCreatorStats = async (req, res) => {
    try {
        const userId = req.user._id;

        const videos = await Video.find({ userId });

        const totalVideos = videos.length;
        const totalViews = videos.reduce((acc, curr) => acc + (curr.views || 0), 0);
        const totalLikes = videos.reduce((acc, curr) => acc + (curr.likes || 0), 0);
        const totalDislikes = videos.reduce((acc, curr) => acc + (curr.dislikes || 0), 0);

        // Find top video
        const mostViewedVideo = videos.sort((a, b) => b.views - a.views)[0] || null;

        res.json({
            totalVideos,
            totalViews,
            totalLikes,
            totalDislikes,
            mostViewedVideo
        });
    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
