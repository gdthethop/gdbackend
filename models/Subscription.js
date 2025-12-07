const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    subscriber: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Allows subscribing to users who are creators
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Avoid duplicate subscriptions
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
