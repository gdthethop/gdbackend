// routes/authRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// POST register route
const { Types } = require('mongoose');

router.post('/register', async (req, res) => {

    const { name, email, password } = req.body;



    // Validate required fields
    if (!name || !email || !password) {

        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {

            return res.status(400).json({ error: 'User already exists' });
        }

        // Generate userId as a new ObjectId string
        const userId = new Types.ObjectId().toString();

        // Create new user with userId
        const newUser = new User({ userId, name, email, password });
        await newUser.save();

        // Generate JWT token
        const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });


        res.status(201).json({ message: 'User registered successfully', user: { name: newUser.name, email: newUser.email }, token });
    } catch (error) {
        console.error('❌ Registration error:', error);
        // Return detailed error message for debugging
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

// POST login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;



    // Validate that both email and password are provided
    if (!email || !password) {

        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Query the database for the user
        const user = await User.findOne({ email });


        if (!user) {

            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Compare passwords using comparePassword method
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {

            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });



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
