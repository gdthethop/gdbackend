// routes/authRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// POST register route
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    console.log(`🔍 Received registration request - Name: ${name}, Email: ${email}`);

    // Validate required fields
    if (!name || !email || !password) {
        console.log('❌ Missing required fields');
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('❌ User already exists');
            return res.status(400).json({ error: 'User already exists' });
        }

        // Create new user
        const newUser = new User({ name, email, password });
        await newUser.save();

        console.log(`✅ User registered successfully: ${newUser.email}`);
        res.status(201).json({ message: 'User registered successfully', user: { name: newUser.name, email: newUser.email } });
    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    console.log(`🔍 Received login request - Email: ${email}, Password: ${password}`);

    // Validate that both email and password are provided
    if (!email || !password) {
        console.log('❌ Missing email or password');
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Query the database for the user
        const user = await User.findOne({ email });
        console.log('🔎 User found in DB:', user);

        if (!user) {
            console.log('❌ User not found');
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Compare passwords
        if (user.password !== password) {
            console.log('❌ Password mismatch');
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        console.log(`✅ Login successful for ${user.email}`);

        // Return the response with token and user data
        res.json({
            token,
            user: { name: user.name, email: user.email },
        });
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
