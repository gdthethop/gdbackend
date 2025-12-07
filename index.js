const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const corsOptions = {
  origin: true, // Allow all origins temporarily for testing
  credentials: true,
};

require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videos');
const commentRoutes = require('./routes/comments');

const app = express();

const PORT = process.env.PORT || 5000;

const MONGO_URI = process.env.MONGO_URI || MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI environment variable is not set.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on('connected', () => {

});

db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

db.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/comments', commentRoutes);

// Serve static files from the React app build directory
const buildPath = path.join(__dirname, '..', 'Gdplayer', 'build');
app.use(express.static(buildPath));

// Catch-all handler to serve index.html for any request that doesn't match API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {

});
