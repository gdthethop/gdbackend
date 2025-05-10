const mongoose = require('mongoose');
const Video = require('../models/video');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGO_URI || 'mongodb+srv://Cluster58986:SElVZW5xRWJm@cluster58986.jitfk.mongodb.net/sample_mflix?retryWrites=true&w=majority&appName=Cluster58986';

async function generateUniqueShortCode() {
  let shortCode;
  let isUnique = false;
  while (!isUnique) {
    shortCode = crypto.randomBytes(3).toString('hex'); // 6 characters
    const existing = await Video.findOne({ shortCode });
    if (!existing) {
      isUnique = true;
    }
  }
  return shortCode;
}

async function migrateShortCodes() {
  try {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const videosWithoutShortCode = await Video.find({ shortCode: { $exists: false } });
    console.log(`Found ${videosWithoutShortCode.length} videos without shortCode`);

    for (const video of videosWithoutShortCode) {
      const shortCode = await generateUniqueShortCode();
      video.shortCode = shortCode;
      await video.save();
      console.log(`Updated video ${video._id} with shortCode ${shortCode}`);
    }

    console.log('Migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateShortCodes();
