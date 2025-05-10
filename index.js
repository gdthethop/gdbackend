const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const allowedOrigins = ['https://gdthethop.github.io', 'http://localhost:3000'];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // Allow non-browser requests like Postman or curl
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videos');
const commentRoutes = require('./routes/comments'); 

const app = express();
console.log('JWT_SECRET:', process.env.JWT_SECRET);
const PORT = process.env.PORT || 5000;

const MONGO_URI = process.env.MONGO_URI || MONGO_URI;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI environment variable is not set.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on('connected', () => {
  console.log('MongoDB connected successfully');
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

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/comments', commentRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
