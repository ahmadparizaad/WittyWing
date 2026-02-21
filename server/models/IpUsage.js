const mongoose = require('mongoose');

const IpUsageSchema = new mongoose.Schema({
  ip: { type: String, required: true, index: true },
  dailyCount: { type: Number, default: 0 },
  lastReset: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.IpUsage || mongoose.model('IpUsage', IpUsageSchema);
