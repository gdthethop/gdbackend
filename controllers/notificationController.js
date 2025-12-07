const Notification = require('../models/Notification');

// Get User Notifications
exports.getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Error fetching notifications", error: error.message });
    }
};

// Mark as Read
exports.markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        if (notificationId === 'all') {
            await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
        } else {
            await Notification.findByIdAndUpdate(notificationId, { isRead: true });
        }
        res.status(200).json({ message: "Marked as read" });
    } catch (error) {
        res.status(500).json({ message: "Error updating notification", error: error.message });
    }
};

// Internal Helper to Create Notification
exports.createNotification = async (userId, type, message, link) => {
    try {
        const notification = new Notification({ userId, type, message, link });
        await notification.save();
    } catch (error) {
        console.error("Error creating notification:", error);
    }
};
