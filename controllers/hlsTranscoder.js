/**
 * hlsTranscoder.js
 * ─────────────────────────────────────────────────────────────────
 * YouTube-style "fast-start" adaptive streaming pipeline.
 *
 * Flow:
 *   1. Fetch the raw upload from S3 (SDK GetObject, falls back to HTTP)
 *   2. Probe it (resolution, fps, audio) and pick a bitrate ladder that never
 *      upscales above the source
 *   3. Remux the original with `+faststart` so the MP4 fallback can start
 *      playing before it is fully downloaded
 *   4. Encode the FIRST (≈360p) rendition, upload it and publish a playable
 *      master.m3u8 immediately → transcodingStatus = 'ready'
 *   5. Encode the remaining renditions one by one; after each, upload it and
 *      rewrite master.m3u8 so viewers get higher qualities as they appear
 *
 * Streaming details (what makes playback start fast + switch smoothly):
 *   • 4-second fMP4/CMAF segments (small first download)
 *   • Keyframe every 2 s, forced and identical across renditions
 *     (-force_key_frames + -sc_threshold 0) → seamless ABR switching
 *   • Capped VBR (-maxrate / -bufsize) so segment sizes are predictable
 *   • CODECS / AVERAGE-BANDWIDTH / RESOLUTION in master.m3u8 so hls.js can
 *     choose a level without first downloading every variant playlist
 *   • Segments uploaded with long-lived immutable Cache-Control (CDN friendly)
 *
 * Jobs run through a single in-process queue so we never run two ffmpeg
 * encodes at once (important on small instances).
 *
 * Requires: ffmpeg + ffprobe on the host
 *   macOS:  brew install ffmpeg
 *   Ubuntu: sudo apt-get install ffmpeg
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const ffmpeg = require('fluent-ffmpeg');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require('../config/s3');
const Video = require('../models/video');

const BUCKET = process.env.AWS_BUCKET_NAME_VIDEOS;
const REGION = process.env.AWS_REGION;

const SEGMENT_SECONDS = 4;
const KEYFRAME_SECONDS = 2;
const UPLOAD_CONCURRENCY = 6;

// Bitrate ladder (shortest side → bitrates). Similar to YouTube's H.264 ladder.
// Order here = encode order AFTER the fast-start rung.
const LADDER = [
  { name: '240p',  size: 240,  videoKbps: 400,  audioKbps: 64,  level: '3.0', codec: 'avc1.4d401e' },
  { name: '360p',  size: 360,  videoKbps: 800,  audioKbps: 96,  level: '3.0', codec: 'avc1.4d401e' },
  { name: '480p',  size: 480,  videoKbps: 1400, audioKbps: 128, level: '3.1', codec: 'avc1.4d401f' },
  { name: '720p',  size: 720,  videoKbps: 2800, audioKbps: 128, level: '3.1', codec: 'avc1.4d401f' },
  { name: '1080p', size: 1080, videoKbps: 5000, audioKbps: 192, level: '4.0', codec: 'avc1.4d4028' },
];
const FAST_START_RUNG = '360p';

const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
const CACHE_MASTER = 'public, max-age=30';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract { bucket, key } from an S3 URL (virtual-hosted or path style). */
function parseS3Url(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const p = decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\+/g, ' '));
    let m = host.match(/^(.+)\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/);
    if (m) return { bucket: m[1], key: p };
    m = host.match(/^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/);
    if (m) {
      const [bucket, ...rest] = p.split('/');
      return { bucket, key: rest.join('/') };
    }
  } catch (_) { /* not a URL */ }
  return null;
}

function httpDownload(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(httpDownload(new URL(res.headers.location, url).toString(), destPath, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
      }
      pipeline(res, fs.createWriteStream(destPath)).then(resolve, reject);
    }).on('error', reject);
  });
}

/** Download the source video. Uses the S3 SDK when possible (works for private buckets). */
async function downloadSource(url, destPath) {
  const parsed = parseS3Url(url);
  if (parsed && parsed.bucket === BUCKET) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    await pipeline(obj.Body, fs.createWriteStream(destPath));
    return parsed;
  }
  await httpDownload(url, destPath);
  return null;
}

function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      if (!v) return reject(new Error('No video stream found'));
      const a = data.streams.find((s) => s.codec_type === 'audio');
      const [num, den] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
      const fps = den ? num / den : num;
      // Respect rotation metadata (phone videos) when deciding orientation
      const rotation = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0));
      const rotated = rotation === 90 || rotation === 270;
      const width = rotated ? v.height : v.width;
      const height = rotated ? v.width : v.height;
      resolve({
        width,
        height,
        fps: Number.isFinite(fps) && fps > 0 && fps <= 120 ? fps : 30,
        hasAudio: !!a,
        duration: Number(data.format.duration) || 0,
      });
    });
  });
}

/** Choose renditions ≤ source short side (always at least the smallest rung). */
function pickLadder(meta) {
  const shortSide = Math.min(meta.width, meta.height);
  // Allow a small tolerance so e.g. 1072p sources still get 1080p
  const picked = LADDER.filter((r) => r.size <= shortSide * 1.05);
  return picked.length ? picked : [LADDER[0]];
}

/** Order renditions so the fast-start rung (or closest below it) is first. */
function encodeOrder(ladder) {
  const fastSize = LADDER.find((l) => l.name === FAST_START_RUNG).size;
  let fastIdx = 0;
  ladder.forEach((r, i) => { if (r.size <= fastSize) fastIdx = i; });
  return [ladder[fastIdx], ...ladder.filter((_, i) => i !== fastIdx)];
}

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    command.on('end', resolve).on('error', reject).run();
  });
}

/** Remux the original MP4 so its moov atom is at the front (instant progressive start). */
async function faststartOriginal(inputPath, tmpBase, s3Loc) {
  if (!s3Loc || !/\.(mp4|m4v)$/i.test(s3Loc.key)) return;
  const out = path.join(tmpBase, 'faststart.mp4');
  try {
    await runFfmpeg(
      ffmpeg(inputPath).outputOptions(['-map', '0', '-c', 'copy', '-movflags', '+faststart']).output(out)
    );
    await s3.send(new PutObjectCommand({
      Bucket: s3Loc.bucket,
      Key: s3Loc.key,
      Body: fs.createReadStream(out),
      ContentLength: fs.statSync(out).size,
      ContentType: 'video/mp4',
      CacheControl: CACHE_IMMUTABLE,
    }));
    console.log('[HLS] Original re-uploaded with +faststart');
  } catch (err) {
    console.warn('[HLS] faststart remux skipped:', err.message);
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/** Output frame rate for a rung: like YouTube, high-frame-rate is reserved for 720p+. */
function outputFps(r, meta) {
  return meta.fps > 32 && r.size < 720 ? meta.fps / 2 : meta.fps;
}

/** ffmpeg output options for one rendition (written to outputDir/<name>/). */
function renditionOutputOptions(outputDir, r, meta) {
  const dir = path.join(outputDir, r.name);
  fs.mkdirSync(dir, { recursive: true });
  const portrait = meta.height > meta.width;
  const scale = portrait ? `scale=${r.size}:-2` : `scale=-2:${r.size}`;
  const fps = outputFps(r, meta);
  const fpsFilter = fps !== meta.fps ? `fps=${fps},` : '';
  const gop = Math.round(fps * KEYFRAME_SECONDS);

  return [
    '-map', '0:v:0',
    ...(meta.hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', `${fpsFilter}${scale}:flags=bicubic,format=yuv420p`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-level:v', r.level,
    '-b:v', `${r.videoKbps}k`,
    '-maxrate', `${Math.round(r.videoKbps * 1.07)}k`,
    '-bufsize', `${Math.round(r.videoKbps * 1.5)}k`,
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${KEYFRAME_SECONDS})`,
    ...(meta.hasAudio ? ['-c:a', 'aac', '-b:a', `${r.audioKbps}k`, '-ac', '2', '-ar', '48000'] : []),
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(dir, 'seg_%04d.m4s'),
  ];
}

/**
 * Encode one or more renditions in a SINGLE ffmpeg run. The source is decoded
 * once and fed to every encoder — crucial for 4K/60fps uploads where decoding
 * dominates the cost.
 */
function transcodeRenditions(inputPath, outputDir, rungs, meta) {
  const cmd = ffmpeg(inputPath).inputOptions(['-threads', '0']);
  for (const r of rungs) {
    cmd.output(path.join(outputDir, r.name, 'index.m3u8'));
    cmd.outputOptions(renditionOutputOptions(outputDir, r, meta));
  }
  return runFfmpeg(cmd).catch((err) => {
    throw new Error(`ffmpeg [${rungs.map((r) => r.name).join(',')}]: ${err.message}`);
  });
}

/** Backwards-compatible single-rendition helper. */
function transcodeRendition(inputPath, outputDir, r, meta) {
  return transcodeRenditions(inputPath, outputDir, [r], meta);
}

function walkDir(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walkDir(full) : [full];
  });
}

function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
  if (ext === '.m4s') return 'video/iso.segment';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.ts') return 'video/mp2t';
  return 'application/octet-stream';
}

async function uploadFile(localPath, key, cacheControl) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentLength: fs.statSync(localPath).size,
    ContentType: contentTypeFor(localPath),
    CacheControl: cacheControl,
  }));
}

/** Upload a rendition folder in parallel. Variant playlist goes last so it never references missing segments. */
async function uploadRendition(outputDir, name, s3Prefix) {
  const files = walkDir(path.join(outputDir, name));
  const media = files.filter((f) => !f.endsWith('.m3u8'));
  const playlists = files.filter((f) => f.endsWith('.m3u8'));
  const keyFor = (f) => `${s3Prefix}/${path.relative(outputDir, f).replace(/\\/g, '/')}`;

  let i = 0;
  const worker = async () => {
    while (i < media.length) {
      const f = media[i++];
      await uploadFile(f, keyFor(f), CACHE_IMMUTABLE);
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  for (const f of playlists) await uploadFile(f, keyFor(f), CACHE_IMMUTABLE);
}

/** Measure real peak/average bitrate of a finished rendition from its segment sizes. */
function measureBandwidth(outputDir, name) {
  const dir = path.join(outputDir, name);
  const playlist = fs.readFileSync(path.join(dir, 'index.m3u8'), 'utf8').split('\n');
  let peak = 0, totalBits = 0, totalDur = 0, dur = 0;
  for (const line of playlist) {
    if (line.startsWith('#EXTINF:')) dur = parseFloat(line.slice(8));
    else if (line && !line.startsWith('#')) {
      const bits = fs.statSync(path.join(dir, line.trim())).size * 8;
      if (dur > 0) peak = Math.max(peak, bits / dur);
      totalBits += bits;
      totalDur += dur;
    }
  }
  return { peak: Math.round(peak), average: Math.round(totalDur ? totalBits / totalDur : 0) };
}

function buildMasterPlaylist(done, meta, outputDir) {
  const portrait = meta.height > meta.width;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS'];
  const sorted = [...done].sort((a, b) => a.size - b.size);
  for (const r of sorted) {
    const { peak, average } = r.bw;
    const short = r.size;
    const long = Math.round((short * Math.max(meta.width, meta.height)) / Math.min(meta.width, meta.height) / 2) * 2;
    const res = portrait ? `${short}x${long}` : `${long}x${short}`;
    const codecs = meta.hasAudio ? `${r.codec},mp4a.40.2` : r.codec;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${peak || r.videoKbps * 1200},AVERAGE-BANDWIDTH=${average || r.videoKbps * 1000},` +
        `RESOLUTION=${res},FRAME-RATE=${outputFps(r, meta).toFixed(3)},CODECS="${codecs}",NAME="${r.name}"`,
      `${r.name}/index.m3u8`
    );
  }
  const masterPath = path.join(outputDir, 'master.m3u8');
  fs.writeFileSync(masterPath, lines.join('\n') + '\n');
  return masterPath;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runJob(videoId, rawMp4Url) {
  const tmpBase = path.join(__dirname, '../tmp_hls', String(videoId));
  const inputPath = path.join(tmpBase, 'input');
  const outputDir = path.join(tmpBase, 'output');
  const s3Prefix = `hls/${videoId}`;
  const masterKey = `${s3Prefix}/master.m3u8`;
  const hlsUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${masterKey}`;
  let published = false;

  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    await Video.findByIdAndUpdate(videoId, {
      transcodingStatus: 'processing',
      transcodingStartedAt: new Date(),
      hlsUrl: null,
    });

    console.log(`[HLS] ${videoId}: downloading source…`);
    const s3Loc = await downloadSource(rawMp4Url, inputPath);
    const meta = await probe(inputPath);
    const ladder = encodeOrder(pickLadder(meta));
    console.log(`[HLS] ${videoId}: ${meta.width}x${meta.height}@${meta.fps.toFixed(2)} → ${ladder.map((r) => r.name).join(', ')}`);

    await faststartOriginal(inputPath, tmpBase, s3Loc);

    const done = [];
    // Pass 1: the fast-start rung alone → playable ASAP.
    // Pass 2: every remaining rung in one ffmpeg run (source decoded once).
    const passes = [ladder.slice(0, 1), ladder.slice(1)].filter((p) => p.length);
    for (const rungs of passes) {
      const names = rungs.map((r) => r.name).join(', ');
      const t0 = Date.now();
      console.log(`[HLS] ${videoId}: encoding ${names}…`);
      await transcodeRenditions(inputPath, outputDir, rungs, meta);
      console.log(`[HLS] ${videoId}: encoded ${names} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      for (const r of rungs) {
        const bw = measureBandwidth(outputDir, r.name);
        await uploadRendition(outputDir, r.name, s3Prefix);
        done.push({ ...r, bw });
        // Free disk as we go (segments are already in S3)
        fs.rmSync(path.join(outputDir, r.name), { recursive: true, force: true });
      }

      const masterPath = buildMasterPlaylist(done, meta, outputDir);
      await uploadFile(masterPath, masterKey, CACHE_MASTER);

      if (!published) {
        // First rung is live → the video is playable right now
        published = true;
        await Video.findByIdAndUpdate(videoId, { hlsUrl, transcodingStatus: 'ready', duration: meta.duration });
        console.log(`[HLS] ${videoId}: fast-start rendition live → ${hlsUrl}`);
      }
    }
    console.log(`[HLS] ${videoId}: all renditions complete`);
  } catch (err) {
    console.error(`[HLS] ${videoId} failed:`, err.message);
    // If at least one rendition is live, keep serving it rather than marking failed
    if (!published) await Video.findByIdAndUpdate(videoId, { transcodingStatus: 'failed' });
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────
// One encode at a time; duplicate requests for the same video are collapsed.

const queue = [];
const queued = new Set();
let running = false;

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { videoId, url, resolve } = queue.shift();
    try {
      await runJob(videoId, url);
    } finally {
      queued.delete(videoId);
      resolve();
    }
  }
  running = false;
}

/**
 * Enqueue a video for transcoding. Resolves when that job finishes.
 * @param {string} videoId   - MongoDB _id of the Video document
 * @param {string} rawMp4Url - S3 URL of the original upload
 */
function transcodeVideoToHLS(videoId, rawMp4Url) {
  videoId = String(videoId);
  if (queued.has(videoId)) return Promise.resolve();
  queued.add(videoId);
  return new Promise((resolve) => {
    queue.push({ videoId, url: rawMp4Url, resolve });
    drain();
  });
}

/**
 * On server start: re-queue jobs that were interrupted (e.g. the instance
 * restarted mid-encode) or never started.
 */
async function resumeInterruptedJobs() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stuck = await Video.find({
      $or: [
        { transcodingStatus: 'processing' },
        { transcodingStatus: 'pending', createdAt: { $gte: since } },
      ],
    }).select('_id link');
    if (stuck.length) console.log(`[HLS] Resuming ${stuck.length} interrupted transcode job(s)`);
    for (const v of stuck) transcodeVideoToHLS(v._id, v.link);
  } catch (err) {
    console.error('[HLS] Could not resume jobs:', err.message);
  }
}

module.exports = {
  transcodeVideoToHLS,
  resumeInterruptedJobs,
  // exported for tests
  _internals: { parseS3Url, pickLadder, encodeOrder, probe, transcodeRendition, transcodeRenditions, measureBandwidth, buildMasterPlaylist },
};
