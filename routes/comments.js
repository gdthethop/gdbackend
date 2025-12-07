const express = require('express');
const router = express.Router();
const { getCommentsForVideo, submitComment, likeComment, dislikeComment } = require('../controllers/commentsController'); // Import controller functions
const { protect } = require('../middleware/authMiddleware');

// Get all comments for a specific video
router.get('/:videoId/comments', getCommentsForVideo);

// Submit a new comment
router.post('/:videoId/comments', submitComment);

// Like/Dislike
router.put('/:commentId/like', protect, likeComment);
router.put('/:commentId/dislike', protect, dislikeComment);

module.exports = router;
