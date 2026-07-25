const Video = require('../models/video');
const Playlist = require('../models/Playlist');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { s3 } = require('../config/s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { transcodeVideoToHLS } = require('./hlsTranscoder'); // HLS pipeline

// Set ffmpeg path if not in global path (optional, depends on environment)
// ffmpeg.setFfmpegPath('/usr/bin/ffmpeg'); 

// Fetch all videos
const getVideos = async (req, res) => {
  try {
    const { genre } = req.query;
    let query = {
      $or: [
        { scheduledPublishDate: { $exists: false } },
        { scheduledPublishDate: null },
        { scheduledPublishDate: { $lte: new Date() } }
      ]
    };

    if (genre && genre !== 'All') {
      // genres is an array in schema, so simple value match works for "contains"
      query.genres = genre;
    }

    const videos = await Video.find(query).sort({ createdAt: -1 }).populate('userId', 'name');
    res.status(200).json(videos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching videos", error: error.message });
  }
};

// Fetch a specific video by ID
const getVideoById = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('userId', 'name profileIcon');
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
    const video = await Video.findOne({ shortCode: req.params.shortCode }).populate('userId', 'name profileIcon');
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error fetching video", error: error.message });
  }
};

// Increment views by shortCode
const incrementViewsByShortCode = async (req, res) => {
  try {
    const video = await Video.findOneAndUpdate(
      { shortCode: req.params.shortCode },
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

// Helper: Generate Thumbnail from Video URL (This is complex to do purely from S3 URL without downloading, 
// so this implementation assumes we might need a separate service or just use a default if not provided, 
// OR the user uploads one. If we strictly want auto-gen, we'd need to download the video stream to tmp, 
// gen thumbnail, and upload to S3. For this step, we will prioritize User Upload and fallback to a default placeholder 
// if not provided, as full stream processing is heavy for this step without temp files).
// HOWEVER, since the user ASKED for it: "If no thumbnail is uploaded, the system should automatically generate thumbnails"
// I will add a placeholder TODO comment or basic implementation if possible. 
// REALISTICALLY: Generating thumbnail from S3 URL requires downloading at least the header. 
// A better approach for MVP is suggesting the user upload one, or we use a lambda.
// BUT, I will implement a basic version that sets a default if missing, as full ffmpeg on server requires storage.

// 1. Upload Raw Video Only
const uploadRawVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No video file provided" });
    }
    // MulterS3 has already uploaded it
    res.status(200).json({
      message: "Video uploaded to S3",
      videoUrl: req.file.location
    });
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// 1.5 Upload Custom Thumbnail
const uploadThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No thumbnail file provided" });
    }
    res.status(200).json({
      message: "Thumbnail uploaded to S3",
      thumbnailUrl: req.file.location
    });
  } catch (error) {
    res.status(500).json({ message: "Thumbnail upload failed", error: error.message });
  }
};

// Helper: Download a remote URL to a local file path
const downloadToTemp = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(destPath);
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

// Helper: Get video duration in seconds using ffprobe
const getVideoDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 60);
    });
  });
};

// 2. Generate Thumbnails from S3 URL
// Downloads the video locally first (same approach as hlsTranscoder) so ffmpeg
// can seek reliably even if the S3 bucket is private / not streamable.
const generateThumbnails = async (req, res) => {
  const tempDir = path.join(__dirname, '../tmp_thumbs');
  const sessionId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const localVideoPath = path.join(tempDir, `video-${sessionId}.mp4`);

  try {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ message: "videoUrl is required" });

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Step 1: Download video to temp file so ffmpeg can seek by time
    console.log('[Thumbs] Downloading video for thumbnail generation...');
    await downloadToTemp(videoUrl, localVideoPath);
    console.log('[Thumbs] Download complete, probing duration...');

    // Step 2: Get actual video duration so we can pick good timestamps
    const duration = await getVideoDuration(localVideoPath);
    console.log(`[Thumbs] Duration: ${duration.toFixed(1)}s`);

    // Pick timestamps at 15%, 50%, 85% of the video (avoiding black intros/outros)
    const timestamps = [
      Math.max(1, duration * 0.15),
      duration * 0.50,
      Math.min(duration - 1, duration * 0.85),
    ].map(t => parseFloat(t.toFixed(2)));

    // Step 3: Extract a frame at each timestamp and upload to S3
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
              resolve(null); // Don't block — skip this one
            }
          })
          .on('error', (err) => {
            console.error(`[Thumbs] FFmpeg error for thumb ${i}:`, err.message);
            resolve(null); // Non-fatal — skip this thumbnail
          })
          .run();
      });
    };

    // Run all 3 in parallel
    const results = await Promise.all(timestamps.map((ts, i) => processScreenshot(ts, i)));

    // Filter out any nulls (failed frames) before sending response
    const uploadedThumbs = results.filter(Boolean);

    res.status(200).json({ thumbnails: uploadedThumbs });

  } catch (error) {
    console.error('[Thumbs] Thumbnail generation failed:', error.message);
    res.status(500).json({ message: "Thumbnail generation failed", error: error.message });
  } finally {
    // Always clean up the downloaded video
    if (fs.existsSync(localVideoPath)) {
      try { fs.unlinkSync(localVideoPath); } catch (_) {}
    }
  }
};

// 3. Publish (Finalize) Video
const publishVideo = async (req, res) => {
  try {
    const { title, description, playlistNames, videoUrl, thumbnailUrl, scheduledPublishDate } = req.body;

    if (!videoUrl) return res.status(400).json({ message: "Video URL is missing" });

    // Generate shortCode
    let shortCode;
    let isUnique = false;
    while (!isUnique) {
      shortCode = crypto.randomBytes(3).toString('hex');
      const existing = await Video.findOne({ shortCode });
      if (!existing) isUnique = true;
    }

    // Parse playlistNames (could be JSON string or array depending on client)
    let parsedPlaylists = [];
    if (playlistNames) {
      try {
        parsedPlaylists = (typeof playlistNames === 'string') ? JSON.parse(playlistNames) : playlistNames;
      } catch (e) {
        parsedPlaylists = [playlistNames];
      }
    }

    const newVideo = new Video({
      title,
      description,
      link: videoUrl,
      thumbnail: thumbnailUrl || "https://placehold.co/600x400?text=No+Thumbnail",
      genres: parsedPlaylists,
      shortCode,
      userId: req.user._id,
      scheduledPublishDate: scheduledPublishDate || null,
      transcodingStatus: 'pending', // HLS not ready yet
    });

    const savedVideo = await newVideo.save();

    if (parsedPlaylists && parsedPlaylists.length > 0) {
      for (const pname of parsedPlaylists) {
        let playlist = await Playlist.findOne({ title: pname, user: req.user._id });
        if (!playlist) {
          playlist = new Playlist({
            title: pname,
            videos: [savedVideo._id],
            user: req.user._id
          });
        } else {
          playlist.videos.push(savedVideo._id);
        }
        await playlist.save();
      }
    }

    // ── Fire HLS transcoding in the background (non-blocking) ──────────────
    // We respond to the client immediately; transcoding runs async.
    // The frontend polls GET /api/videos/:id/transcode-status to know when ready.
    transcodeVideoToHLS(String(savedVideo._id), videoUrl).catch((err) =>
      console.error('[HLS] Background transcode error:', err.message)
    );

    res.status(201).json({
      message: "Video published — HLS transcoding started in background",
      video: savedVideo,
    });

  } catch (error) {
    res.status(500).json({ message: "Publish failed", error: error.message });
  }
};

// 4. Get HLS transcode status — frontend polls this after upload
const getTranscodeStatus = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select('transcodingStatus hlsUrl');
    if (!video) return res.status(404).json({ message: 'Video not found' });
    res.status(200).json({
      transcodingStatus: video.transcodingStatus,
      hlsUrl: video.hlsUrl || null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transcode status', error: error.message });
  }
};

// Deprecated old uploadVideo but keeping for backward compatibility if needed
// Or simply replacing it. The route logic will change, so we can ignore this.
const uploadVideo = async (req, res) => {
  // ... (Legacy code, can be removed or kept as fallback)
  // For cleanliness, I am retaining the old function content in place or creating new ones above.
  // But wait, the previous `uploadVideo` was the ONLY export.
  res.status(410).json({ message: "Endpoint deprecated. Use /upload-raw then /publish." });
};

const getPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({ user: req.user._id }).populate('videos');
    res.status(200).json(playlists);
  } catch (error) {
    res.status(500).json({ message: "Error fetching playlists", error: error.message });
  }
};

const createPlaylist = async (req, res) => {
  try {
    const { title } = req.body;
    const newPlaylist = new Playlist({
      title,
      user: req.user._id
    });
    await newPlaylist.save();
    res.status(201).json(newPlaylist);
  } catch (error) {
    res.status(500).json({ message: "Error creating playlist", error: error.message });
  }
};

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

// Decrement likes (unlike)
const decrementLikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: -1 } },
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

// Increment dislikes
const incrementDislikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: 1 } },
      { new: true }
    ).select('-link');
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating dislikes", error: error.message });
  }
};

// Decrement dislikes (undislike)
const decrementDislikes = async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { dislikes: -1 } },
      { new: true }
    ).select('-link');
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.status(200).json(video);
  } catch (error) {
    res.status(500).json({ message: "Error updating dislikes", error: error.message });
  }
};

module.exports = {
  getVideos,
  getVideoById,
  getVideoByShortCode,
  incrementViewsByShortCode,
  uploadVideo, // Legacy
  uploadRawVideo,
  uploadThumbnail,
  generateThumbnails,
  publishVideo,
  getTranscodeStatus,
  incrementViews,
  incrementLikes,
  decrementLikes,
  incrementDislikes,
  decrementDislikes,
  getPlaylists,
  createPlaylist
};
