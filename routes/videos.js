const express = require("express");
const router = express.Router();
const { getVideos, getVideoById, uploadVideo, incrementViews, incrementLikes, decrementLikes, incrementDislikes, decrementDislikes, getVideoByShortCode } = require("../controllers/videoController");  // Update the import path

// Routes
router.get("/", getVideos);  // Fetch all videos
router.get("/:id", getVideoById);  // Fetch a video by ID
router.get("/short/:shortCode", getVideoByShortCode); // Fetch video by shortCode
router.post("/upload", uploadVideo);  // Upload a new video
router.patch("/:id/incrementViews", incrementViews);  // Increment views
router.patch("/:id/incrementLikes", incrementLikes);  // Increment likes
router.patch("/:id/decrementLikes", decrementLikes);  // Decrement likes (unlike)
router.patch("/:id/incrementDislikes", incrementDislikes);  // Increment dislikes
router.patch("/:id/decrementDislikes", decrementDislikes);  // Decrement dislikes (undislike)

module.exports = router;
