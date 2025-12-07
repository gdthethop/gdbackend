require('dotenv').config();
const mongoose = require('mongoose');
const Video = require('../models/video');
const Playlist = require('../models/Playlist');

const migrateGenres = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Get all videos
        const videos = await Video.find({});
        console.log(`Found ${videos.length} videos.`);

        const genreMap = new Set();

        // 2. Collect unique genres
        videos.forEach(video => {
            if (video.genres && video.genres.length > 0) {
                video.genres.forEach(g => {
                    if (g && typeof g === 'string') {
                        const cleanGenre = g.trim();
                        if (cleanGenre) genreMap.add(cleanGenre);
                    }
                });
            }
        });

        console.log(`Found ${genreMap.size} unique genres:`, Array.from(genreMap));

        // 3. Create Playlists
        for (const genre of genreMap) {
            const exists = await Playlist.findOne({ title: genre });
            if (!exists) {
                // Find videos that have this genre to link them
                const relatedVideos = await Video.find({ genres: genre }).select('_id');
                const videoIds = relatedVideos.map(v => v._id);

                const newPlaylist = new Playlist({
                    title: genre,
                    videos: videoIds
                });
                await newPlaylist.save();
                console.log(`Created Playlist: ${genre} with ${videoIds.length} videos`);
            } else {
                console.log(`Playlist "${genre}" already exists, skipping.`);
            }
        }

        console.log('Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
};

migrateGenres();
