const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  link: { type: String, required: true },
  genres: [String], // Will store Playlist Name(s)
  thumbnail: String,
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  shortCode: { type: String, unique: true, sparse: true }, // Added shortCode field
  createdAt: { type: Date, default: Date.now },
});

const Video = mongoose.model("Video", videoSchema);

module.exports = Video;
