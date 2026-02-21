const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: String,
  url: String,
  description: { type: String, maxlength: 280 }
});

const UserSchema = new mongoose.Schema({
  googleId: { type: String, required: true, index: true },
  displayName: String,
  email: String,
  role: String,
  short_bio: { type: String, maxlength: 280, default: '' },
  projects: [ProjectSchema],
  refreshToken: String,
  refreshTokenExpiresAt: Date,
  preferences: { type: Object, default: {} },
  usage: {
    dailyCount: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now }
  }
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
