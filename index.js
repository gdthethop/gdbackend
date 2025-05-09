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

const app = express();// Log the JWT_SECRET for debugging
console.log('JWT_SECRET:', process.env.JWT_SECRET); // Log the JWT_SECRET for debugging
const PORT = process.env.PORT || 5000;

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gdbackend'; // Replace with your MongoDB URI
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("MongoDB connection error:", err));

// Middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));
app.use(express.json()); // To parse incoming JSON requests

// Use Authentication Routes
app.use('/api/auth', authRoutes);  // This sets up /api/auth/register and /api/auth/login
app.use("/api/videos", videoRoutes);
app.use('/api/videos', commentRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
