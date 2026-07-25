const Notification = require('../models/Notification');

/**
 * GET /api/notifications  [protected]
 * Returns the 20 most recent notifications for the authenticated user, newest first.
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

/**
 * PUT /api/notifications/:notificationId/read  [protected]
 * Marks a notification (or all notifications) as read.
 * Pass 'all' as the notificationId to mark every unread notification as read.
 */
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    if (notificationId === 'all') {
      await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
    } else {
      await Notification.findByIdAndUpdate(notificationId, { isRead: true });
    }
    res.status(200).json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

/**
 * Internal helper — not exposed as an HTTP route.
 * Called by other controllers (commentsController, subscriptionController)
 * to create in-app notifications for a user.
 * @param {ObjectId} userId  — recipient of the notification
 * @param {string}   type    — notification category (e.g. 'comment', 'subscription')
 * @param {string}   message — human-readable notification text
 * @param {string}   link    — relative URL to navigate to when the notification is clicked
 */
exports.createNotification = async (userId, type, message, link) => {
  try {
    const notification = new Notification({ userId, type, message, link });
    await notification.save();
  } catch (error) {
    console.error('Error creating notification:', error);
    // Non-fatal — notification failure should not break the main request
  }
};
