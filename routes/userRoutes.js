const express = require('express');
const router = express.Router();
const { getWatchLater, toggleWatchLater } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/watch-later', protect, getWatchLater);
router.post('/watch-later', protect, toggleWatchLater);

module.exports = router;
