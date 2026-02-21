const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requireAuth(req, res, next) {
  // JWT-only auth for serverless
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET || 'change-me');
      if (payload.type !== 'access') throw new Error('Invalid token type');
      req.user = { _id: payload.id, displayName: payload.displayName, email: payload.email };
      return next();
    } catch (err) {
      // invalid token
    }
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Get profile for logged-in user
router.get('/', requireAuth, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  res.json({ profile: user });
});

// Update profile for logged-in user
router.post('/', requireAuth, async (req, res) => {
  try {
    const updates = req.body || {};
    const toUpdate = {};
    // Validate and sanitize allowed fields only
    if (typeof updates.displayName === 'string') {
      const dn = updates.displayName.trim();
      if (dn.length > 100) return res.status(400).json({ error: 'displayName is too long' });
      toUpdate.displayName = dn;
    }
    if (typeof updates.role === 'string') {
      const r = updates.role.trim();
      if (r.length > 100) return res.status(400).json({ error: 'role is too long' });
      toUpdate.role = r;
    }
    if (typeof updates.short_bio === 'string') {
      const bio = updates.short_bio.trim();
      if (bio.length > 280) return res.status(400).json({ error: 'short_bio is too long' });
      toUpdate.short_bio = bio;
    }
    if (Array.isArray(updates.projects)) {
      const projects = updates.projects;
      if (projects.length > 50) return res.status(400).json({ error: 'too many projects' });
      const sanitizedProjects = [];
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i] || {};
        const name = (typeof p.name === 'string' ? p.name.trim() : '');
        const url = (typeof p.url === 'string' ? p.url.trim() : '');
        const description = (typeof p.description === 'string' ? p.description.trim() : '');
        if (!name) return res.status(400).json({ error: `project[${i}].name is required` });
        if (name.length > 100) return res.status(400).json({ error: `project[${i}].name is too long` });
        if (description.length > 280) return res.status(400).json({ error: `project[${i}].description is too long` });
        if (url) {
          try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              return res.status(400).json({ error: `project[${i}].url must be http(s)` });
            }
          } catch (err) {
            return res.status(400).json({ error: `project[${i}].url is invalid` });
          }
        }
        sanitizedProjects.push({ name, url, description });
      }
      toUpdate.projects = sanitizedProjects;
    }
    // ensure only valid columns are updated
    const user = await User.findByIdAndUpdate(req.user._id, { $set: toUpdate }, { new: true }).lean();
    res.json({ profile: user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

module.exports = router;
