const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe, checkSubscription, getSubscribersCount } = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

router.post('/:channelId', protect, subscribe);
router.delete('/:channelId', protect, unsubscribe);
router.get('/check/:channelId', protect, checkSubscription);
router.get('/count/:channelId', getSubscribersCount);

module.exports = router;
