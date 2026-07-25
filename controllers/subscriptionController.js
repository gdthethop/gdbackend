const Subscription = require('../models/Subscription');
const { createNotification } = require('./notificationController');

/**
 * POST /api/subscriptions/:channelId  [protected]
 * Subscribes the authenticated user to a channel.
 * Prevents self-subscription and duplicate subscriptions.
 * Sends an in-app notification to the channel owner.
 */
exports.subscribe = async (req, res) => {
  try {
    const { channelId }  = req.params;
    const subscriberId   = req.user._id;

    if (channelId === subscriberId.toString()) {
      return res.status(400).json({ message: 'You cannot subscribe to yourself.' });
    }

    const existing = await Subscription.findOne({ subscriber: subscriberId, channel: channelId });
    if (existing) return res.status(400).json({ message: 'Already subscribed.' });

    await new Subscription({ subscriber: subscriberId, channel: channelId }).save();

    await createNotification(
      channelId,
      'subscription',
      `${req.user.name || 'A user'} subscribed to your channel.`,
      '/profile'
    );

    res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * DELETE /api/subscriptions/:channelId  [protected]
 * Unsubscribes the authenticated user from a channel.
 */
exports.unsubscribe = async (req, res) => {
  try {
    await Subscription.findOneAndDelete({ subscriber: req.user._id, channel: req.params.channelId });
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * GET /api/subscriptions/check/:channelId  [protected]
 * Returns { isSubscribed: boolean } for the authenticated user and the given channel.
 */
exports.checkSubscription = async (req, res) => {
  try {
    const existing = await Subscription.findOne({ subscriber: req.user._id, channel: req.params.channelId });
    res.status(200).json({ isSubscribed: !!existing });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * GET /api/subscriptions/count/:channelId
 * Returns the total subscriber count for a channel. Public — no auth required.
 */
exports.getSubscribersCount = async (req, res) => {
  try {
    const count = await Subscription.countDocuments({ channel: req.params.channelId });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
