/**
 * hlsTranscoder.js
 * ─────────────────────────────────────────────────────────────────
 * YouTube-style HLS transcoding pipeline.
 *
 * Flow:
 *   1. Download raw MP4 from S3 to a local temp file
 *   2. Run ffmpeg to produce 3 quality renditions (360p / 720p / 1080p)
 *      Each rendition is split into ~4-second .ts segments + a rendition .m3u8
 *   3. Build a master.m3u8 that lists all renditions
 *   4. Upload everything (segments + playlists) to S3 under hls/<videoId>/
 *   5. Update Video document: hlsUrl = master.m3u8 URL, transcodingStatus = 'ready'
 *
 * Requires: ffmpeg binary on the host system
 *   macOS:  brew install ffmpeg
 *   Ubuntu: sudo apt-get install ffmpeg
 *   Render: add `apt install ffmpeg` pre-build step
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/s3');
const Video = require('../models/video');

const BUCKET = process.env.AWS_BUCKET_NAME_VIDEOS;
const REGION = process.env.AWS_REGION;

// Rendition ladder — matches YouTube's adaptive quality levels
const RENDITIONS = [
  { name: '360p',  width: 640,  height: 360,  videoBitrate: '800k',  audioBitrate: '96k'  },
  { name: '720p',  width: 1280, height: 720,  videoBitrate: '2500k', audioBitrate: '128k' },
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
];

// Download a remote URL to a local file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Recursively get all files in a directory
function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walkDir(full) : [full];
  });
}

// Upload all files in localDir to S3 under s3Prefix, return master.m3u8 S3 key
async function uploadDirToS3(localDir, s3Prefix) {
  const files = walkDir(localDir);
  let masterKey = null;
  for (const filePath of files) {
    const relPath = path.relative(localDir, filePath).replace(/\\/g, '/');
    const s3Key = `${s3Prefix}/${relPath}`;
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.m3u8' ? 'application/x-mpegURL' :
      ext === '.ts'   ? 'video/mp2t' :
      'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    }));
    if (relPath === 'master.m3u8') masterKey = s3Key;
  }
  return masterKey;
}

// Transcode one rendition with ffmpeg → .ts segments + rendition .m3u8
function transcodeRendition(inputPath, outputDir, rendition) {
  return new Promise((resolve, reject) => {
    const { name, width, height, videoBitrate, audioBitrate } = rendition;
    const renditionDir = path.join(outputDir, name);
    fs.mkdirSync(renditionDir, { recursive: true });
    const playlistPath = path.join(renditionDir, 'index.m3u8');
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease`,
        `-c:v libx264`,
        `-preset veryfast`,
        `-crf 23`,
        `-b:v ${videoBitrate}`,
        `-maxrate ${videoBitrate}`,
        `-bufsize ${parseInt(videoBitrate) * 2}k`,
        `-c:a aac`,
        `-b:a ${audioBitrate}`,
        `-ar 44100`,
        `-hls_time 6`,
        `-hls_playlist_type vod`,
        `-hls_segment_filename ${path.join(renditionDir, '%03d.ts')}`,
        `-hls_flags independent_segments`,
      ])
      .output(playlistPath)
      .on('end', () => resolve(playlistPath))
      .on('error', (err) => reject(new Error(`ffmpeg [${name}]: ${err.message}`)))
      .run();
  });
}

// Write the master HLS playlist linking all renditions
function buildMasterPlaylist(renditions, outputDir) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of renditions) {
    const bw = parseInt(r.videoBitrate) * 1000;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${r.width}x${r.height},NAME="${r.name}"`,
      `${r.name}/index.m3u8`
    );
  }
  const masterPath = path.join(outputDir, 'master.m3u8');
  fs.writeFileSync(masterPath, lines.join('\n'));
  return masterPath;
}

/**
 * Main pipeline — run asynchronously (fire-and-forget from publishVideo).
 * @param {string} videoId   - MongoDB _id of the Video document
 * @param {string} rawMp4Url - Public S3 URL of the original MP4
 */
async function transcodeVideoToHLS(videoId, rawMp4Url) {
  const tmpBase = path.join(__dirname, '../tmp_hls', String(videoId));
  const inputPath = path.join(tmpBase, 'input.mp4');
  const outputDir = path.join(tmpBase, 'output');

  try {
    await Video.findByIdAndUpdate(videoId, { transcodingStatus: 'processing' });

    fs.mkdirSync(tmpBase, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`[HLS] Downloading MP4 for video ${videoId}...`);
    await downloadFile(rawMp4Url, inputPath);

    // Transcode each rendition sequentially to avoid CPU overload
    for (const rendition of RENDITIONS) {
      console.log(`[HLS] Encoding ${rendition.name}...`);
      await transcodeRendition(inputPath, outputDir, rendition);
    }

    buildMasterPlaylist(RENDITIONS, outputDir);

    console.log(`[HLS] Uploading segments to S3...`);
    const s3Prefix = `hls/${videoId}`;
    const masterKey = await uploadDirToS3(outputDir, s3Prefix);
    const hlsUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${masterKey}`;

    await Video.findByIdAndUpdate(videoId, { hlsUrl, transcodingStatus: 'ready' });
    console.log(`[HLS] Complete → ${hlsUrl}`);
  } catch (err) {
    console.error(`[HLS] Failed for ${videoId}:`, err.message);
    await Video.findByIdAndUpdate(videoId, { transcodingStatus: 'failed' });
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

module.exports = { transcodeVideoToHLS };
