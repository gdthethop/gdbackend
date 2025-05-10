const express = require("express");
const router = express.Router();
const {
  getVideos,
  getVideoById,
  uploadVideo,
  incrementViews,
  incrementViewsByShortCode,
  incrementLikes,
  decrementLikes,
  incrementDislikes,
  decrementDislikes,
  getVideoByShortCode,
} = require("../controllers/videoController");

// Routes
router.get("/", getVideos);
router.get("/:id", getVideoById);
router.get("/short/:shortCode", getVideoByShortCode);
router.post("/upload", uploadVideo);
router.patch("/:id/incrementViews", incrementViews);
router.patch("/short/:shortCode/incrementViews", incrementViewsByShortCode);
router.patch("/:id/incrementLikes", incrementLikes);
router.patch("/:id/decrementLikes", decrementLikes);
router.patch("/:id/incrementDislikes", incrementDislikes);
router.patch("/:id/decrementDislikes", decrementDislikes);

module.exports = router;
