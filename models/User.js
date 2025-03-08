const mongoose = require('mongoose');

// Define the User schema
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
}, { collection: 'users' });

// Method to compare password during login (plain text comparison)
userSchema.methods.comparePassword = function (password) {
    return this.password === password; // Compare plain text passwords
};

module.exports = mongoose.model('User', userSchema);
