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

// Routes
router.get("/", getVideos);
router.get("/playlists", getPlaylists);
router.post("/playlists", createPlaylist);
router.get("/:id", getVideoById);
router.get("/short/:shortCode", getVideoByShortCode);
router.post("/upload-raw", upload.single('video'), uploadRawVideo);
router.post("/upload-thumbnail", upload.single('thumbnail'), uploadThumbnail);
router.post("/generate-thumbnails", generateThumbnails);
router.post("/publish", publishVideo);
// router.post("/upload", upload.fields ... ) // Keep or comment out legacy
router.patch("/:id/incrementViews", incrementViews);
router.patch("/short/:shortCode/incrementViews", incrementViewsByShortCode);
router.patch("/:id/incrementLikes", incrementLikes);
router.patch("/:id/decrementLikes", decrementLikes);
router.patch("/:id/incrementDislikes", incrementDislikes);
router.patch("/:id/decrementDislikes", decrementDislikes);

module.exports = router;
