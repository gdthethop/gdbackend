const Subscription = require('../models/Subscription');
const { createNotification } = require('./notificationController');

exports.subscribe = async (req, res) => {
    try {
        const { channelId } = req.params;
        const subscriberId = req.user._id;

        if (channelId === subscriberId.toString()) {
            return res.status(400).json({ message: "You cannot subscribe to yourself." });
        }

        const existing = await Subscription.findOne({ subscriber: subscriberId, channel: channelId });
        if (existing) {
            return res.status(400).json({ message: "Already subscribed." });
        }

        const subscription = new Subscription({
            subscriber: subscriberId,
            channel: channelId
        });
        await subscription.save();

        // Notify channel owner
        const subscriberName = req.user.name || "A user";
        await createNotification(
            channelId,
            'subscription',
            `${subscriberName} subscribed to your channel.`,
            `/profile` // Can be enhanced to point to the subscriber's profile if we have a public route
        );

        res.status(201).json({ message: "Subscribed successfully." });

    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.unsubscribe = async (req, res) => {
    try {
        const { channelId } = req.params;
        const subscriberId = req.user._id;

        await Subscription.findOneAndDelete({ subscriber: subscriberId, channel: channelId });

        res.status(200).json({ message: "Unsubscribed successfully." });

    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.checkSubscription = async (req, res) => {
    try {
        const { channelId } = req.params;
        const subscriberId = req.user._id;

        const existing = await Subscription.findOne({ subscriber: subscriberId, channel: channelId });

        res.status(200).json({ isSubscribed: !!existing });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.getSubscribersCount = async (req, res) => {
    try {
        const { channelId } = req.params;
        const count = await Subscription.countDocuments({ channel: channelId });
        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};
