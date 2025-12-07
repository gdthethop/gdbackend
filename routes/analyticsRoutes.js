const express = require('express');
const router = express.Router();
const { getCreatorStats } = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, getCreatorStats);

module.exports = router;
