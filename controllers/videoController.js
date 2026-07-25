const Video    = require('../models/video');
const Playlist = require('../models/Playlist');
const crypto   = require('crypto');
const ffmpeg   = require('fluent-ffmpeg');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const http     = require('http');
const { s3 }   = require('../config/s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { transcodeVideoToHLS } = require('./hlsTranscoder');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Downloads a remote URL to a local file path.
 * Used by thumbnail generation to avoid streaming private S3 URLs through ffmpeg.
 */
const downloadToTemp = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
};

/**
 * Returns the duration of a local video file in seconds using ffprobe.
 */
const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 60);
    });
  });
};

// ─── Public Video Routes ──────────────────────────────────────────────────────

/**
 * GET /api/videos
 * Returns all published videos, optionally filtered by genre.
 * Excludes videos with a future scheduledPublishDate.
 */
const getVideos = async (req, res) => {
  try {
    const { genre } = req.query;
    const query = {
      $or: [
        { scheduledPublishDate: { $exists: false } },
        { scheduledPublishDate: null },
        { scheduledPublishDate: { $lte: new Date() } },
      ],
    };

    if (genre && genre !== 'All') {
      query.genres = genre; // genres is an array field; matches if value is included
    }

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name');

    res.status(200).json(videos);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching videos', error: error.message });
  }
};

/**
 * GET /api/videos/:id
 * Returns a single video by its MongoDB ObjectId.
 */
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('userId', 'name profileIcon');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching video', error: error.message });
  }
};

/**
 * GET /api/videos/short/:shortCode
 * Returns a single video by its short shareable code (e.g. used in /watch?v=abc123).
 */
const getVideoByShortCode = async (req, res) => {
  try {
    const video = await Video.findOne({ shortCode: req.params.shortCode })
      .populate('userId', 'name profileIcon');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching video', error: error.message });
  }
};

/**
 * PATCH /api/videos/:id/incrementViews
 * Increments the view count for a video by its ObjectId.
 */
const incrementViews = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating views', error: error.message });
  }
};

/**
 * PATCH /api/videos/short/:shortCode/incrementViews
 * Increments the view count for a video by its shortCode.
 */
const incrementViewsByShortCode = async (req, res) => {
  try {
    const video = await Video.findOneAndUpdate(
      { shortCode: req.params.shortCode },
      { $inc: { views: 1 } },
      { new: true }
    ).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating views', error: error.message });
  }
};

// ─── Upload Routes ────────────────────────────────────────────────────────────

/**
 * POST /api/videos/upload-raw
 * Step 1 of the upload flow. Receives a raw video file via multipart/form-data
 * and stores it directly in S3 via multer-s3. Returns the S3 URL.
 */
const uploadRawVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No video file provided' });
    res.status(200).json({ message: 'Video uploaded to S3', videoUrl: req.file.location });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

/**
 * POST /api/videos/upload-thumbnail
 * Accepts a custom thumbnail image upload and stores it in the thumbnails S3 bucket.
 * Returns the public S3 URL of the uploaded thumbnail.
 */
const uploadThumbnail = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No thumbnail file provided' });
    res.status(200).json({ message: 'Thumbnail uploaded to S3', thumbnailUrl: req.file.location });
  } catch (error) {
    res.status(500).json({ message: 'Thumbnail upload failed', error: error.message });
  }
};

/**
 * POST /api/videos/generate-thumbnails
 * Automatically generates 3 thumbnail frames from a video URL.
 *
 * Flow:
 *   1. Download the video to a local temp file (avoids streaming private S3 URLs via ffmpeg)
 *   2. Probe the video duration with ffprobe
 *   3. Extract frames at 15%, 50%, and 85% of the video using ffmpeg
 *   4. Upload each frame as a JPEG to the thumbnails S3 bucket
 *   5. Return the 3 public S3 URLs
 *   6. Clean up the temp video file in all cases
 */
const generateThumbnails = async (req, res) => {
  const tempDir       = path.join(__dirname, '../tmp_thumbs');
  const sessionId     = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const localVideoPath = path.join(tempDir, `video-${sessionId}.mp4`);

  try {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ message: 'videoUrl is required' });

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    console.log('[Thumbs] Downloading video for thumbnail generation...');
    await downloadToTemp(videoUrl, localVideoPath);
    console.log('[Thumbs] Download complete, probing duration...');

    const duration = await getVideoDuration(localVideoPath);
    console.log(`[Thumbs] Duration: ${duration.toFixed(1)}s`);

    // Pick timestamps at 15%, 50%, 85% — avoids black intro/outro frames
    const timestamps = [
      Math.max(1, duration * 0.15),
      duration * 0.50,
      Math.min(duration - 1, duration * 0.85),
    ].map(t => parseFloat(t.toFixed(2)));

    // Extract one frame per timestamp, upload to S3, return the URL (or null on failure)
    const processScreenshot = (timestamp, i) => {
      return new Promise((resolve) => {
        const filename = `thumb-${sessionId}-${i}.jpg`;
        const filepath = path.join(tempDir, filename);

        ffmpeg(localVideoPath)
          .seekInput(timestamp)
          .frames(1)
          .size('1280x720')
          .output(filepath)
          .on('end', async () => {
            try {
              const fileContent = fs.readFileSync(filepath);
              await s3.send(new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME_THUMBNAILS,
                Key: filename,
                Body: fileContent,
                ContentType: 'image/jpeg',
              }));
              const location = `https://${process.env.AWS_BUCKET_NAME_THUMBNAILS}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
              fs.unlinkSync(filepath);
              console.log(`[Thumbs] Uploaded thumbnail ${i + 1}: ${location}`);
              resolve(location);
            } catch (uploadErr) {
              console.error(`[Thumbs] S3 upload failed for thumb ${i}:`, uploadErr.message);
              resolve(null); // Non-fatal — skip this frame
            }
          })
          .on('error', (err) => {
            console.error(`[Thumbs] FFmpeg error for thumb ${i}:`, err.message);
            resolve(null); // Non-fatal — skip this frame
          })
          .run();
      });
    };

    const results       = await Promise.all(timestamps.map((ts, i) => processScreenshot(ts, i)));
    const uploadedThumbs = results.filter(Boolean);

    res.status(200).json({ thumbnails: uploadedThumbs });

  } catch (error) {
    console.error('[Thumbs] Thumbnail generation failed:', error.message);
    res.status(500).json({ message: 'Thumbnail generation failed', error: error.message });
  } finally {
    // Always clean up the downloaded video regardless of success or failure
    if (fs.existsSync(localVideoPath)) {
      try { fs.unlinkSync(localVideoPath); } catch (_) {}
    }
  }
};

// ─── Publish Route ────────────────────────────────────────────────────────────

/**
 * POST /api/videos/publish
 * Step 2 (final) of the upload flow. Saves the video metadata to the database
 * and kicks off HLS transcoding in the background (non-blocking).
 *
 * Body: { title, description, playlistNames, videoUrl, thumbnailUrl, scheduledPublishDate }
 */
const publishVideo = async (req, res) => {
  try {
    const { title, description, playlistNames, videoUrl, thumbnailUrl, scheduledPublishDate } = req.body;

    if (!videoUrl) return res.status(400).json({ message: 'Video URL is missing' });

    // Generate a unique 6-character shortCode for share links
    let shortCode;
    let isUnique = false;
    while (!isUnique) {
      shortCode = crypto.randomBytes(3).toString('hex');
      const existing = await Video.findOne({ shortCode });
      if (!existing) isUnique = true;
    }

    // Parse playlistNames from JSON string or use as-is if already an array
    let parsedPlaylists = [];
    if (playlistNames) {
      try {
        parsedPlaylists = typeof playlistNames === 'string'
          ? JSON.parse(playlistNames)
          : playlistNames;
      } catch (_) {
        parsedPlaylists = [playlistNames];
      }
    }

    const newVideo = new Video({
      title,
      description,
      link: videoUrl,
      thumbnail: thumbnailUrl || 'https://placehold.co/600x400?text=No+Thumbnail',
      genres: parsedPlaylists,
      shortCode,
      userId: req.user._id,
      scheduledPublishDate: scheduledPublishDate || null,
      transcodingStatus: 'pending',
    });

    const savedVideo = await newVideo.save();

    // Add video to each playlist, creating the playlist if it doesn't exist
    for (const pname of parsedPlaylists) {
      let playlist = await Playlist.findOne({ title: pname, user: req.user._id });
      if (!playlist) {
        playlist = new Playlist({ title: pname, videos: [savedVideo._id], user: req.user._id });
      } else {
        playlist.videos.push(savedVideo._id);
      }
      await playlist.save();
    }

    // Fire HLS transcoding in background — client polls /transcode-status for readiness
    transcodeVideoToHLS(String(savedVideo._id), videoUrl).catch((err) =>
      console.error('[HLS] Background transcode error:', err.message)
    );

    res.status(201).json({
      message: 'Video published — HLS transcoding started in background',
      video: savedVideo,
    });
  } catch (error) {
    res.status(500).json({ message: 'Publish failed', error: error.message });
  }
};

// ─── Transcode Status ─────────────────────────────────────────────────────────

/**
 * GET /api/videos/:id/transcode-status
 * Polled by the frontend after upload to check whether HLS transcoding is done.
 * Returns { transcodingStatus, hlsUrl }.
 * transcodingStatus values: 'pending' | 'processing' | 'ready' | 'failed'
 */
const getTranscodeStatus = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select('transcodingStatus hlsUrl');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json({ transcodingStatus: video.transcodingStatus, hlsUrl: video.hlsUrl || null });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transcode status', error: error.message });
  }
};

// ─── Like / Dislike Routes ────────────────────────────────────────────────────

/**
 * PATCH /api/videos/:id/incrementLikes
 * Increments the like count on a video by 1.
 */
const incrementLikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true }).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating likes', error: error.message });
  }
};

/**
 * PATCH /api/videos/:id/decrementLikes
 * Decrements the like count on a video by 1 (unlike).
 */
const decrementLikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { likes: -1 } }, { new: true }).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating likes', error: error.message });
  }
};

/**
 * PATCH /api/videos/:id/incrementDislikes
 * Increments the dislike count on a video by 1.
 */
const incrementDislikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { dislikes: 1 } }, { new: true }).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating dislikes', error: error.message });
  }
};

/**
 * PATCH /api/videos/:id/decrementDislikes
 * Decrements the dislike count on a video by 1 (un-dislike).
 */
const decrementDislikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(req.params.id, { $inc: { dislikes: -1 } }, { new: true }).select('-link');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: 'Error updating dislikes', error: error.message });
  }
};

// ─── Playlist Routes ──────────────────────────────────────────────────────────

/**
 * GET /api/videos/playlists
 * Returns all playlists owned by the authenticated user, with full video details.
 */
const getPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({ user: req.user._id }).populate('videos');
    res.status(200).json(playlists);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching playlists', error: error.message });
  }
};

/**
 * POST /api/videos/playlists
 * Creates a new empty playlist for the authenticated user.
 * Body: { title }
 */
const createPlaylist = async (req, res) => {
  try {
    const { title } = req.body;
    const newPlaylist = new Playlist({ title, user: req.user._id });
    await newPlaylist.save();
    res.status(201).json(newPlaylist);
  } catch (error) {
    res.status(500).json({ message: 'Error creating playlist', error: error.message });
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  getVideos,
  getVideoById,
  getVideoByShortCode,
  incrementViews,
  incrementViewsByShortCode,
  uploadRawVideo,
  uploadThumbnail,
  generateThumbnails,
  publishVideo,
  getTranscodeStatus,
  incrementLikes,
  decrementLikes,
  incrementDislikes,
  decrementDislikes,
  getPlaylists,
  createPlaylist,
};
