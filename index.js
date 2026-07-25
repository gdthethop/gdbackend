const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

// ─── Route Imports ────────────────────────────────────────────────────────────
const authRoutes             = require('./routes/authRoutes');
const videoRoutes            = require('./routes/videos');
const commentRoutes          = require('./routes/comments');
const historyRoutes          = require('./routes/historyRoutes');
const analyticsRoutes        = require('./routes/analyticsRoutes');
const userRoutes             = require('./routes/userRoutes');
const subscriptionRoutes     = require('./routes/subscriptionRoutes');
const notificationRoutes     = require('./routes/notificationRoutes');
const multipartUploadRoutes  = require('./routes/multipartUploadRoutes');

// ─── App Setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Database Connection ──────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable is not set.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('connected',    () => console.log('✅ MongoDB connected'));
db.on('error',   (err) => console.error('❌ MongoDB connection error:', err));
db.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));

// ─── Middleware ───────────────────────────────────────────────────────────────
const corsOptions = { origin: true, credentials: true };
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests for all routes
app.use(express.json());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',            authRoutes);
app.use('/api/videos',          videoRoutes);
app.use('/api/comments',        commentRoutes);
app.use('/api/history',         historyRoutes);
app.use('/api/analytics',       analyticsRoutes);
app.use('/api/users',           userRoutes);
app.use('/api/subscriptions',   subscriptionRoutes);
app.use('/api/notifications',   notificationRoutes);
app.use('/api/multipart-upload', multipartUploadRoutes);

// ─── Static Frontend (production) ────────────────────────────────────────────
// Serves the built React app when running backend + frontend together
const buildPath = path.join(__dirname, '..', 'Gdplayer', 'build');
app.use(express.static(buildPath));

// Catch-all: serve index.html for any route not matched by the API
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
