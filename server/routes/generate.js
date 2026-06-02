const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

const tonePromptMap = {
  Default: "Write a natural, concise reply as if you're responding to a friend's tweet. Don't sound robotic or overly formal.",
  Funny: "Write a witty and playful reply. Use harmless sarcasm, puns, or light humor. Keep it short and meme-like.",
  Sarcastic: "Reply with obvious exaggeration and dry wit. Your response should mock the tweet lightly without being mean. Keep it concise. Aim for 1-2 sentences.",
  Sincere: "Respond in a heartfelt and genuine way. Be kind, thoughtful, and human. No exaggerations or jokes. Keep it to 1-2 sentences.",
  "One-liner": "Craft a punchy one-line reply that could go viral. Keep it under 15 words. No fluff.",
  Asking: "Turn your reply into a thoughtful question or follow-up. Make it sound curious and engaging. Limit to one short question.",
  Friendly: "Write a warm and casual reply like you're chatting with someone you like. Use emojis if natural. Keep it to a maximum of 2 sentences.",
  Thanking: "Compose a short and grateful reply. Be polite and appreciative, but avoid sounding overly formal. Ensure it's a single, very brief sentence."
};

// Module-level pools — initialized once, persist across requests
const geminiModelPool = {
  models: [
    {
      name: 'gemini-2.5-flash-lite',
      endpoint: 'gemini-2.5-flash-lite:generateContent',
      rpm: 10, rpd: 20,
      counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
      disabledUntil: null, weight: 0.1
    },
    {
      name: 'gemini-3-flash',
      endpoint: 'gemini-3-flash-preview:generateContent',
      rpm: 5, rpd: 20,
      counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
      disabledUntil: null, weight: 0.1
    },
    {
      name: 'gemini-2.5-flash',
      endpoint: 'gemini-2.5-flash:generateContent',
      rpm: 15, rpd: 1500,
      counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
      disabledUntil: null, weight: 0.35
    }
  ],
  keyState: { index: 0, disabled: {} }
};

const orModelPool = {
  models: [
    { name: 'google/gemma-4-26b-a4b-it:free', disabledUntil: null },
    { name: 'stepfun/step-3.5-flash:free', disabledUntil: null },
    { name: 'nvidia/nemotron-3-super-120b-a12b:free', disabledUntil: null },
    { name: 'openai/gpt-oss-20b:free', disabledUntil: null }
  ],
  index: 0
};

function requireAuth(req, res, next) {
  // JWT-only auth for serverless
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET);
      if (payload.type !== 'access') throw new Error('Invalid token type');
      req.user = { _id: payload.id, displayName: payload.displayName, email: payload.email };
      return next();
    } catch (err) {
      // invalid token
    }
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Optional auth - does not reject on missing/invalid token
function optionalAuth(req) {
  const auth = req.headers.authorization; 
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET);
      if (payload.type === 'access') {
        req.user = { _id: payload.id, displayName: payload.displayName, email: payload.email };
      }
    } catch (err) {
      // ignore invalid token in optional flow
    }
  }
}

function makePrompt(user, tweet_text, tone, images = []) {
  const namePart = user.displayName || user.email || 'Unknown';
  const rolePart = user.role || '';
  const bioPart = user.short_bio || '';
  let projectPart = '';
  try {
    if (Array.isArray(user.projects) && user.projects.length > 0) {
      const projectsSummary = user.projects
        .map((p) => {
          const n = (p && p.name) || '';
          const d = (p && p.description) || '';
          const u = (p && p.url) || '';
          const detail = [d, u].filter(Boolean).join(', ');
          return detail ? `${n} (${detail})` : n;
        })
        .filter(Boolean)
        .slice(0, 5)
        .join('; ');
      if (projectsSummary) projectPart = `Projects: ${projectsSummary}`;
    }
  } catch (e) {
    projectPart = '';
  }

  const tonePrompt = tonePromptMap[tone] || tonePromptMap.Default;

  let imageContext = '';
  if (images && images.length > 0) {
    imageContext = ` There are ${images.length} image(s) attached to the tweet — factor in the visual context when crafting the reply.`;
  }

  // System message: instructions + user profile context
  const systemMessage = [
    `You are a Twitter reply assistant writing on behalf of a specific user. Always reply in first person as that user.`,
    `Tone: ${tone} — ${tonePrompt}${imageContext}`,
    ``,
    `## User Profile`,
    `Name: ${namePart}`,
    rolePart ? `Role: ${rolePart}` : null,
    bioPart ? `Bio: ${bioPart}` : null,
    projectPart ? projectPart : null,
    ``,
    `Write a single reply (max 280 chars) that matches the tone and reflects the user's voice and background. Output only the reply text — no labels, no quotes, no explanation.`,
  ].filter(v => v !== null).join('\n');

  // User message: just the tweet
  const userMessage = `Tweet to reply to:\n${tweet_text}`;

  return { systemMessage, userMessage };
}

router.post('/', async (req, res) => {
  try {
    const { tweet_text, tone, images } = req.body;
    const toneKey = tone || 'Default';
    // Optional auth: try to populate req.user if a token is present, but do not require it
    optionalAuth(req);
    let user = null;
    if (req.user && req.user._id) {
      try {
        user = await User.findById(req.user._id).lean();
        console.info('[generate] User loaded from DB:', JSON.stringify({ id: user?._id, displayName: user?.displayName, role: user?.role, hasBio: !!user?.short_bio, projectCount: user?.projects?.length }));
      } catch (e) {
        console.warn('Failed to load user profile for optional auth', e);
        user = null;
      }
    } else {
      console.warn('[generate] No authenticated user — token missing or invalid. Auth header:', req.headers.authorization ? 'present' : 'absent');
    }
    // If no user is available, use a neutral anonymous profile
    if (!user) {
      user = { displayName: 'WittyWing User', role: '', short_bio: '' };
    }

    const { systemMessage, userMessage } = makePrompt(user, tweet_text, tone, images);
    console.info('System prompt:\n', systemMessage);
    console.info('User message:\n', userMessage);

    // Setup key pool (backwards compatible: support single key via GEMINI_API_KEY)
    const rawKeyList = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => (k || '').trim()).filter(Boolean);
    const apiKeys = Array.from(new Set(rawKeyList)); // unique

    const geminiPool = geminiModelPool;
    const orPool = orModelPool;

    // Enhanced counter reset and utilization logic
    function resetCountersIfNeeded() {
      const now = Date.now();
      geminiPool.models.forEach(model => {
        // Reset RPM counter every minute
        if (now - model.counters.lastRpmReset >= 60000) {
          model.counters.rpm = 0;
          model.counters.lastRpmReset = now;
        }
        // Reset RPD counter every day
        if (now - model.counters.lastRpdReset >= 86400000) {
          model.counters.rpd = 0;
          model.counters.lastRpdReset = now;
        }
        // Proactively clear disabled status if time has passed
        if (model.disabledUntil && model.disabledUntil <= now) {
          model.disabledUntil = null;
        }
      });
      // Also clear OpenRouter disabled status
      orPool.models.forEach(model => {
        if (model.disabledUntil && model.disabledUntil <= now) {
          model.disabledUntil = null;
        }
      });
    }

    // Select best available model based on utilization and health
    function selectBestGeminiModel() {
      resetCountersIfNeeded();
      const now = Date.now();
      
      let bestModel = null;
      let lowestScore = Infinity;
      let soonestAvailable = null;
      let minDisabledTime = Infinity;

      for (const model of geminiPool.models) {
        if (model.disabledUntil && model.disabledUntil > now) {
          if (model.disabledUntil < minDisabledTime) {
            minDisabledTime = model.disabledUntil;
            soonestAvailable = model;
          }
          continue;
        }

        // Calculate utilization score (0-2: lower is better)
        const rpmUtil = model.counters.rpm / model.rpm;
        const rpdUtil = model.counters.rpd / model.rpd;
        
        // Skip if already at limit
        if (rpmUtil >= 0.98 || rpdUtil >= 0.98) {
          continue;
        }

        // Weighted score: RPD matters more for low-quota models
        const score = (rpmUtil * 0.3) + (rpdUtil * 0.7);
        
        if (score < lowestScore) {
          lowestScore = score;
          bestModel = model;
        }
      }

      // Fallback: If all models are disabled, return the one that will be available soonest
      // but only if it's within a reasonable window (e.g. < 5s)
      if (!bestModel && soonestAvailable && (minDisabledTime - now) < 5000) {
          return soonestAvailable;
      }

      return bestModel;
    }

    function selectBestORModel() {
      resetCountersIfNeeded();
      const now = Date.now();
      const total = orPool.models.length;
      
      for (let i = 0; i < total; i++) {
        const idx = (orPool.index + i) % total;
        const model = orPool.models[idx];
        if (!model.disabledUntil || model.disabledUntil <= now) {
          orPool.index = idx; // Update last used index
          return model;
        }
      }
      return orPool.models[0]; // Absolute fallback
    }

    async function callGeminiModelPool(p, images = [], sysMsg = '') {
      if (!apiKeys || apiKeys.length === 0) return { error: 'no-api-keys' };

      const maxModelAttempts = 3;
      let modelAttempts = 0;

      while (modelAttempts < maxModelAttempts) {
        const model = selectBestGeminiModel();
        if (!model) {
          const now = Date.now();
          const disabledModels = geminiPool.models.filter(m => m.disabledUntil && m.disabledUntil > now);
          console.warn(`No available Gemini model. ${disabledModels.length}/${geminiPool.models.length} are on backoff.`);
          return { error: 'pool-exhausted', backoffActive: disabledModels.length > 0 };
        }

        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model.endpoint}`;
        const totalKeys = apiKeys.length;
        let keyAttempts = 0;
        const maxKeyAttempts = Math.min(totalKeys, 3); // Slightly more keys to check

        while (keyAttempts < maxKeyAttempts) {
          const keyIndex = (geminiPool.keyState.index) % totalKeys;
          const candidateKey = apiKeys[keyIndex];
          geminiPool.keyState.index = (geminiPool.keyState.index + 1) % totalKeys;
          
          if (geminiPool.keyState.disabled[candidateKey] > Date.now()) {
            keyAttempts++;
            continue;
          }

          try {
            const parts = [{ text: p }];

            const geminiBody = {
              contents: [{ parts: parts }],
              generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
            };
            if (sysMsg) geminiBody.systemInstruction = { parts: [{ text: sysMsg }] };

            const resp = await axios.post(modelUrl, geminiBody, {
              headers: { 'Content-Type': 'application/json', 'X-goog-api-key': candidateKey },
              timeout: 30000
            });

            model.counters.rpm++;
            model.counters.rpd++;
            console.info(`Gemini success: ${model.name}, RPM: ${model.counters.rpm}/${model.rpm}`);

            const json = resp.data;
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || json?.output || JSON.stringify(json);
            return { text, key: candidateKey, model: model.name };
          } catch (err) {
            const status = err?.response?.status;
            const errorData = err?.response?.data;
            console.warn(`Gemini ${model.name} error ${status}:`, errorData?.error?.message || err.message);
            
            if (status === 429) {
              // Longer backoff on 429 (90s) to be safe
              model.disabledUntil = Date.now() + (90 * 1000);
              break; // Try next model
            }
            if (status === 401 || status === 403) {
              geminiPool.keyState.disabled[candidateKey] = Date.now() + (600 * 1000);
            }
            
            keyAttempts++;
          }
        }
        modelAttempts++;
      }
      return { error: 'max-attempts-reached' };
    }


  const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
  const TRIAL_DAILY_LIMIT = Number(process.env.TRIAL_DAILY_LIMIT || 10);

  function isSameDay(d1, d2) {
    if (!d1) return false;
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Returns { user, allowed, reason } — mutates nothing
  async function checkAndLoadUser(userId) {
    const user = await User.findById(userId).exec();
    if (!user) return { user: null, allowed: false, reason: 'user-not-found' };

    const now = new Date();
    const plan = user.plan || 'trial';

    if (plan === 'trial') {
      const trialStarted = user.trialStartedAt;
      if (!trialStarted || Date.now() - trialStarted.getTime() >= TRIAL_DURATION_MS) {
        return { user, allowed: false, reason: 'trial-expired' };
      }
      // Reset daily count if it's a new day
      const usedToday = isSameDay(user.trialDailyReset, now) ? (user.trialDailyCount || 0) : 0;
      if (usedToday >= TRIAL_DAILY_LIMIT) {
        return { user, allowed: false, reason: 'trial-daily-limit' };
      }
      return { user, allowed: true, reason: 'trial', usedToday };
    }

    if (plan === 'credits') {
      if ((user.credits || 0) <= 0) {
        return { user, allowed: false, reason: 'no-credits' };
      }
      return { user, allowed: true, reason: 'credits' };
    }

    return { user, allowed: false, reason: 'unknown-plan' };
  }

  async function consumeUsage(user, reason) {
    if (reason === 'trial') {
      const now = new Date();
      const usedToday = isSameDay(user.trialDailyReset, now) ? (user.trialDailyCount || 0) : 0;
      user.trialDailyCount = usedToday + 1;
      user.trialDailyReset = now;
    } else if (reason === 'credits') {
      user.credits = Math.max(0, (user.credits || 0) - 1);
      user.creditsUsed = (user.creditsUsed || 0) + 1;
    }
    await user.save();
  }

async function callOpenRouter(promptInput, options = {}) {
    const OR_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OR_API_KEY) return { error: 'no-or-key' };

    const maxORAttempts = 5;
    let orAttempts = 0;

    // Instructions for JSON format if structured is requested
    const structuredSystem = options.structured
      ? `OUTPUT FORMAT: You MUST respond with ONLY a raw JSON object — no preamble, no reasoning, no markdown, no explanation. The JSON must match exactly: {"reply": "<string, max 280 chars>", "tone": "<one of: ${Object.keys(tonePromptMap).join(', ')}>", "reason": "<optional string, max 120 chars>"}. First character of your response must be '{'.`
      : "";

    while (orAttempts < maxORAttempts) {
      const modelObj = selectBestORModel();
      if (!modelObj) break;

      const modelName = modelObj.name;
      console.log(`[OR-Pool] Trying model: ${modelName} (Attempt ${orAttempts + 1}/${maxORAttempts})`);

      try {
        // Build messages with proper system role
        const messages = [];

        // System role: profile context + tone instructions (+ JSON format if structured)
        const systemParts = [options.systemMessage || promptInput];
        if (structuredSystem) systemParts.push(structuredSystem);
        messages.push({ role: 'system', content: systemParts.join('\n\n') });

        // User role: the tweet (with optional images)
        const userText = options.userMessage || promptInput;
        if (options.images && options.images.length > 0) {
          const content = [{ type: 'text', text: userText }];
          options.images.slice(0, 3).forEach(url => {
            content.push({ type: 'image_url', image_url: { url } });
          });
          messages.push({ role: 'user', content });
        } else {
          messages.push({ role: 'user', content: userText });
        }

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: modelName,
          messages: messages,
          temperature: 0.7,
          max_tokens: 300,
          reasoning: { enabled: false }
        }, {
          headers: {
            'Authorization': `Bearer ${OR_API_KEY}`,
            'HTTP-Referer': 'https://twitter-automation-zeta.vercel.app/',
            'X-Title': 'Twitter AI Reply Automation',
            'Content-Type': 'application/json'
          },
          timeout: 25000
        });

        const rawMessage = response.data?.choices?.[0]?.message;
        console.info(`[OR-Pool][${modelName}] Raw message object:`, JSON.stringify(rawMessage));
        const rawText = rawMessage?.content || "";
        console.info(`[OR-Pool][${modelName}] rawText extracted: "${rawText}"`);
        let finalReply = rawText;

        // If structured was requested, try to parse JSON
        if (options.structured) {
          try {
            // Extract JSON object even if surrounded by reasoning text
            const jsonMatch = rawText.match(/\{[\s\S]*"reply"[\s\S]*\}/);
            const cleanedText = jsonMatch ? jsonMatch[0] : rawText.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanedText);
            if (parsed && typeof parsed.reply === 'string') {
              finalReply = parsed.reply;
            } else {
              // JSON parsed but no reply field — skip this attempt
              console.warn(`[OR-Pool] JSON missing reply field for ${modelName}. Retrying.`);
              orAttempts++;
              continue;
            }
          } catch (e) {
            // JSON parse failed entirely — discard reasoning text, retry with next model
            console.warn(`[OR-Pool] JSON Parse failed for ${modelName}. Discarding response.`);
            modelObj.disabledUntil = Date.now() + 30000;
            orAttempts++;
            continue;
          }
        }

        if (finalReply && finalReply.trim()) {
           console.info(`[OR-Pool] Success via ${modelName}`);
           return { text: finalReply.trim(), model: modelName };
        }
        
        orAttempts++;
      } catch (err) {
        const st = err.response?.status;
        const errData = err.response?.data?.error;
        
        if (st === 429) {
          console.warn(`[OR-Pool] 429 Limit on ${modelName}. Backing off 120s.`);
          modelObj.disabledUntil = Date.now() + 120000;
        } else if (st === 400 && errData?.message?.includes("Developer instruction")) {
           modelObj.disabledUntil = Date.now() + 600000;
        } else {
          console.error(`[OR-Pool] Error ${modelName}:`, st, err.message);
          modelObj.disabledUntil = Date.now() + 60000;
        }
        orAttempts++;
      }
    }

    return { error: 'or-pool-exhausted' };
  }
    // Authenticated users only
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Sign in required to generate replies' });
    }

    // Check plan and enforce limits
    const { user: usageDoc, allowed, reason, usedToday } = await checkAndLoadUser(req.user._id);

    if (!allowed) {
      const messages = {
        'trial-expired': 'Your 3-day free trial has ended. Purchase credits to continue.',
        'trial-daily-limit': `Daily trial limit of ${TRIAL_DAILY_LIMIT} replies reached. Come back tomorrow or purchase credits.`,
        'no-credits': 'No credits remaining. Purchase credits to continue.',
        'user-not-found': 'User not found.',
      };
      return res.status(429).json({
        error: messages[reason] || 'Generation limit reached',
        reason,
      });
    }

    let geminiAttempted = false;
    let openRouterAttempted = false;
    let geminiError = null;
    let openrouterError = null;

    // Trial users: try Gemini first (free quota), fall back to OpenRouter
    // Credits users: go straight to OpenRouter (better quality, metered usage)
    if (reason === 'trial' && apiKeys.length > 0) {
      geminiAttempted = true;
      try {
        const geminiResp = await callGeminiModelPool(userMessage, images, systemMessage);
        if (geminiResp && geminiResp.text) {
          await consumeUsage(usageDoc, reason);
          return res.json({ reply: geminiResp.text, model: geminiResp.model });
        }
        geminiError = geminiResp;
      } catch (e) {
        geminiError = e.message || e;
      }
    }

    // OpenRouter for credits users and as Gemini fallback for trial
    openRouterAttempted = true;
    try {
      const orResp = await callOpenRouter(userMessage, { structured: true, tone: toneKey, images, systemMessage, userMessage });
      if (orResp && orResp.text) {
        await consumeUsage(usageDoc, reason);
        return res.json({ reply: orResp.text, model: orResp.model });
      }
      openrouterError = orResp || 'no-response';
    } catch (e) {
      openrouterError = e.message || e;
    }

    // Both upstream providers attempted but failed — return 502 with diagnostics
    return res.status(502).json({ error: 'Upstream generation failed', details: { geminiAttempted, openRouterAttempted, geminiError, openrouterError } });
  } catch (err) {
    console.error('Error generating reply:', err);
    res.status(500).json({ error: 'Generation failed', details: err.message });
  }
});

module.exports = router;
