const express = require('express');
const router = express.Router();
const { addToHistory, getHistory, clearHistory } = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, addToHistory);
router.get('/', protect, getHistory);
router.delete('/', protect, clearHistory);

module.exports = router;
