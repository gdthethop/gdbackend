const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_WORK_FACTOR = 10;

// Define the User schema
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profileIcon: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
}, { collection: 'users' });

// Pre-save hook to hash password before saving
userSchema.pre('save', async function (next) {
    const user = this;

    if (!user.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
        const hash = await bcrypt.hash(user.password, salt);
        user.password = hash;
        next();
    } catch (err) {
        next(err);
    }
});

// Method to compare password during login using bcrypt
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
