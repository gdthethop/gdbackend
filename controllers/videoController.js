const Video = require('../models/video');
const crypto = require('crypto');

// Fetch all videos
const getVideos = async (req, res) => {
  try {
    const videos = await Video.find(); // Include all fields in the query
    res.status(200).json(videos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching videos", error: error.message });
  }
};

// Fetch a specific video by ID
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id); // Include all fields
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error fetching video", error: error.message });
  }
};

// Fetch a video by shortCode
const getVideoByShortCode = async (req, res) => {
  try {
    const video = await Video.findOne({ shortCode: req.params.shortCode });
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error fetching video", error: error.message });
  }
};

// Upload a new video
const uploadVideo = async (req, res) => {
  try {
    const { title, description, link, genres, runtime, cast, thumbnail } = req.body;
    if (!title || !description || !link) {
      return res.status(400).json({ message: "Title, description, and link are required" });
    }
    // Generate a unique shortCode
    let shortCode;
    let isUnique = false;
    while (!isUnique) {
      shortCode = crypto.randomBytes(3).toString('hex'); // 6 characters
      const existing = await Video.findOne({ shortCode });
      if (!existing) {
        isUnique = true;
      }
    }
    const newVideo = new Video({ title, description, link, genres, runtime, cast, thumbnail, shortCode });
    await newVideo.save();
    res.status(201).json({ message: "Video uploaded successfully", video: { title, description, genres, runtime, cast, thumbnail, shortCode } });
  } catch (error) {
    res.status(500).json({ message: "Error uploading video", error: error.message });
  }
};

// Increment views
const incrementViews = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('-link');
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating views", error: error.message });
  }
};

// Increment likes
const incrementLikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    ).select('-link');
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating likes", error: error.message });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  getVideoByShortCode,
  uploadVideo,
  incrementViews,
  incrementLikes,
};
