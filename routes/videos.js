const express = require("express");
const router = express.Router();
const { getVideos, getVideoById, uploadVideo, incrementViews, incrementLikes } = require("../controllers/videoController");  // Update the import path

// Routes
router.get("/", getVideos);  // Fetch all videos
router.get("/:id", getVideoById);  // Fetch a video by ID
router.post("/upload", uploadVideo);  // Upload a new video
router.patch("/:id/incrementViews", incrementViews);  // Increment views
router.patch("/:id/incrementLikes", incrementLikes);  // Increment likes

module.exports = router;
