const User = require('../models/User');

// Get Watch Later List
exports.getWatchLater = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('watchLater');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user.watchLater);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// Toggle Watch Later (Add/Remove)
exports.toggleWatchLater = async (req, res) => {
    try {
        const { videoId } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const index = user.watchLater.indexOf(videoId);
        let message = '';

        if (index === -1) {
            // Add
            user.watchLater.push(videoId);
            message = 'Added to Watch Later';
        } else {
            // Remove
            user.watchLater.splice(index, 1);
            message = 'Removed from Watch Later';
        }

        await user.save();
        res.status(200).json({ message, watchLater: user.watchLater });

    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
