const express = require('express');
const router = express.Router();
const { getCommentsForVideo, submitComment } = require('../controllers/commentsController'); // Import controller functions

// Get all comments for a specific video
router.get('/:videoId/comments', getCommentsForVideo);

// Submit a new comment
router.post('/:videoId/comments', submitComment);

module.exports = router;
