const Video = require('../models/video');

// Fetch all videos
const getVideos = async (req, res) => {
  try {
    const videos = await Video.find();
    // Filter out the link field before sending the response
    const filteredVideos = videos.map(({ link, ...rest }) => rest);
    res.status(200).json(filteredVideos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching videos", error });
  }
};

// Fetch a specific video by ID
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    // Filter out the link field before sending the response
    const { link, ...rest } = video._doc;
    res.status(200).json(rest);
  } catch (error) {
    res.status(500).json({ message: "Error fetching video", error });
  }
};

// Upload a new video
const uploadVideo = async (req, res) => {
  const { title, description, link, genres, runtime, cast, thumbnail } = req.body;

  try {
    const newVideo = new Video({
      title,
      description,
      link,
      genres,
      runtime,
      cast,
      thumbnail,
    });

    await newVideo.save();
    // Return only the necessary metadata
    res.status(201).json({ message: "Video uploaded successfully", video: { title, description, genres, runtime, cast, thumbnail } });
  } catch (error) {
    res.status(500).json({ message: "Error uploading video", error });
  }
};

// Increment views
const incrementViews = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating views", error });
  }
};

// Increment likes
const incrementLikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating likes", error });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  uploadVideo,
  incrementViews,
  incrementLikes,
};
