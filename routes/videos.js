const express = require("express");
const router = express.Router();
const { upload } = require("../config/s3");
const {
  getVideos,
  getVideoById,
  uploadVideo,
  uploadRawVideo,
  uploadThumbnail,
  generateThumbnails,
  publishVideo,
  incrementViews,
  incrementViewsByShortCode,
  incrementLikes,
  decrementLikes,
  incrementDislikes,
  decrementDislikes,
  getVideoByShortCode,
  getPlaylists,
  createPlaylist
} = require("../controllers/videoController");

const { protect } = require("../middleware/authMiddleware");

// Routes

// Public Routes (No Auth Required)
router.get("/playlists", protect, getPlaylists); // Only logged-in users typically fetch their OWN playlists in selector context
router.get("/", getVideos);
router.get("/:id", getVideoById);
router.get("/short/:shortCode", getVideoByShortCode);
router.patch("/:id/incrementViews", incrementViews);
router.patch("/short/:shortCode/incrementViews", incrementViewsByShortCode);

// Protected Routes (Auth Required)
router.post("/playlists", protect, createPlaylist);
router.post("/upload-raw", protect, upload.single('video'), uploadRawVideo);
router.post("/upload-thumbnail", protect, upload.single('thumbnail'), uploadThumbnail);
router.post("/generate-thumbnails", protect, generateThumbnails);
router.post("/publish", protect, publishVideo);

// Interaction Routes (Auth Required) - YouTube requires login to like/dislike
router.patch("/:id/incrementLikes", protect, incrementLikes);
router.patch("/:id/decrementLikes", protect, decrementLikes);
router.patch("/:id/incrementDislikes", protect, incrementDislikes);
router.patch("/:id/decrementDislikes", protect, decrementDislikes);

module.exports = router;
