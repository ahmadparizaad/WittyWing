const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const TRIAL_DAILY_LIMIT = 10;

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET);
      if (payload.type !== 'access') throw new Error('Invalid token type');
      req.user = { _id: payload.id, displayName: payload.displayName, email: payload.email };
      return next();
    } catch (_) {}
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// GET /api/credits/status — returns plan, trial info, and credit balance
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    const trialActive = user.trialStartedAt
      ? now - new Date(user.trialStartedAt).getTime() < TRIAL_DURATION_MS
      : false;
    const trialExpiresAt = user.trialStartedAt
      ? new Date(new Date(user.trialStartedAt).getTime() + TRIAL_DURATION_MS)
      : null;

    // Trial daily count (reset at midnight)
    const isSameDay = (d) => {
      if (!d) return false;
      const a = new Date(d), b = new Date();
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    };
    const trialUsedToday = isSameDay(user.trialDailyReset) ? (user.trialDailyCount || 0) : 0;
    const trialRemainingToday = trialActive ? Math.max(0, TRIAL_DAILY_LIMIT - trialUsedToday) : 0;

    res.json({
      plan: user.plan || 'trial',
      trial: {
        active: trialActive,
        startedAt: user.trialStartedAt || null,
        expiresAt: trialExpiresAt,
        dailyLimit: TRIAL_DAILY_LIMIT,
        usedToday: trialUsedToday,
        remainingToday: trialRemainingToday,
      },
      credits: {
        balance: user.credits || 0,
        used: user.creditsUsed || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// POST /api/credits/add — add credits manually (admin/webhook use; payment gateway will call this)
// Body: { amount: number, note: string }
router.post('/add', requireAuth, async (req, res) => {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'];
    if (!adminSecret || providedSecret !== adminSecret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { userId, amount } = req.body;
    if (!userId || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'userId and positive amount required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.credits = (user.credits || 0) + amount;
    user.plan = 'credits';
    await user.save();

    res.json({ ok: true, credits: user.credits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

module.exports = router;
module.exports.TRIAL_DURATION_MS = TRIAL_DURATION_MS;
module.exports.TRIAL_DAILY_LIMIT = TRIAL_DAILY_LIMIT;
