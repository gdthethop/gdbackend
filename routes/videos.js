const express = require('express');
const router  = express.Router();
const { upload } = require('../config/s3');
const {
  getVideos,
  getVideoById,
  getVideoByShortCode,
  uploadRawVideo,
  uploadThumbnail,
  generateThumbnails,
  publishVideo,
  getTranscodeStatus,
  incrementViews,
  incrementViewsByShortCode,
  incrementLikes,
  decrementLikes,
  incrementDislikes,
  decrementDislikes,
  getPlaylists,
  createPlaylist,
} = require('../controllers/videoController');

const { protect } = require('../middleware/authMiddleware');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/',                              getVideos);
router.get('/playlists',    protect,         getPlaylists);
router.get('/:id/transcode-status',          getTranscodeStatus);
router.get('/short/:shortCode',              getVideoByShortCode);
router.get('/:id',                           getVideoById);

router.patch('/:id/incrementViews',                            incrementViews);
router.patch('/short/:shortCode/incrementViews',               incrementViewsByShortCode);

// ─── Protected Routes (auth required) ────────────────────────────────────────
router.post('/playlists',          protect,                    createPlaylist);
router.post('/upload-raw',         protect, upload.single('video'),     uploadRawVideo);
router.post('/upload-thumbnail',   protect, upload.single('thumbnail'), uploadThumbnail);
router.post('/generate-thumbnails', protect,                  generateThumbnails);
router.post('/publish',            protect,                    publishVideo);

// ─── Interaction Routes (auth required) ──────────────────────────────────────
router.patch('/:id/incrementLikes',   protect, incrementLikes);
router.patch('/:id/decrementLikes',   protect, decrementLikes);
router.patch('/:id/incrementDislikes', protect, incrementDislikes);
router.patch('/:id/decrementDislikes', protect, decrementDislikes);

module.exports = router;
