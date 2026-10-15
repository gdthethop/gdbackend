/**
 * Re-transcode existing videos with the fast-start HLS pipeline.
 *
 * Usage (from gdbackend/):
 *   node scripts/retranscode.js                 # every video that isn't 'ready'
 *   node scripts/retranscode.js --all           # every video (re-encode with new ladder/settings)
 *   node scripts/retranscode.js <id> [<id>...]  # specific video ids
 *
 * Requires MONGO_URI and AWS_* in .env, plus ffmpeg on PATH.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Video = require('../models/video');
const { transcodeVideoToHLS } = require('../controllers/hlsTranscoder');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);

  const args = process.argv.slice(2);
  let query;
  if (args.includes('--all')) query = {};
  else if (args.length) query = { _id: { $in: args } };
  else query = { transcodingStatus: { $ne: 'ready' } };

  const videos = await Video.find(query).select('_id title link').lean();
  console.log(`Re-transcoding ${videos.length} video(s)…`);

  let n = 0;
  for (const v of videos) {
    n += 1;
    console.log(`\n[${n}/${videos.length}] ${v._id} — ${v.title}`);
    await transcodeVideoToHLS(v._id, v.link);
    const after = await Video.findById(v._id).select('transcodingStatus').lean();
    console.log(`  → ${after.transcodingStatus}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
