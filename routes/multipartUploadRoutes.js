const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    initializeMultipartUpload,
    getPresignedUrls,
    completeMultipartUpload,
    abortMultipartUpload
} = require('../controllers/multipartUploadController');

// All multipart upload routes require authentication
router.post('/initialize', protect, initializeMultipartUpload);
router.post('/presigned-urls', protect, getPresignedUrls);
router.post('/complete', protect, completeMultipartUpload);
router.post('/abort', protect, abortMultipartUpload);

module.exports = router;
