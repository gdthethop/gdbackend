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
  shortCode: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Verified Uploader
  scheduledPublishDate: { type: Date }, // Feature: Scheduled Publishing
  createdAt: { type: Date, default: Date.now },
  // HLS adaptive streaming fields
  hlsUrl: { type: String, default: null },           // S3 URL of master.m3u8 once transcoding is done
  transcodingStatus: {
    type: String,
    enum: ['pending', 'processing', 'ready', 'failed'],
    default: 'pending',
  },
});

const Video = mongoose.model("Video", videoSchema);

module.exports = Video;
