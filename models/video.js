const mongoose = require("mongoose");
const { toCdnUrl } = require("../config/cdn");

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
  transcodingStartedAt: { type: Date, default: null },
  duration: { type: Number, default: null },         // seconds, filled in by the transcoder
});

// When CDN_BASE_URL is configured (e.g. CloudFront), rewrite S3 media URLs in
// every API response so viewers fetch from the nearest edge instead of S3.
videoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.hlsUrl) ret.hlsUrl = toCdnUrl(ret.hlsUrl);
    if (ret.link) ret.link = toCdnUrl(ret.link);
    return ret;
  },
});

const Video = mongoose.model("Video", videoSchema);

module.exports = Video;
