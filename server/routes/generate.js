const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const IpUsage = require('../models/IpUsage');

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

// Optional auth - does not reject on missing/invalid token
function optionalAuth(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET || 'change-me');
      if (payload.type === 'access') {
        req.user = { _id: payload.id, displayName: payload.displayName, email: payload.email };
      }
    } catch (err) {
      // ignore invalid token in optional flow
    }
  }
}

function makePrompt(user, tweet_text, tone, images = []) {
  // Compose a richer profile summary that includes projects (if any)
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
          return d ? `${n} (${d})` : `${n}`;
        })
        .filter(Boolean)
        .slice(0, 5)
        .join('; ');
      if (projectsSummary) projectPart = `Projects: ${projectsSummary}`;
    }
  } catch (e) {
    projectPart = '';
  }
  const profileSummary = `${namePart}${rolePart ? ' - ' + rolePart : ''}${bioPart ? ' - ' + bioPart : ''}${projectPart ? ' - ' + projectPart : ''}`;
  const tonePrompt = tonePromptMap[tone] || tonePromptMap.Default;

  let imageContext = '';
  if (images && images.length > 0) {
    imageContext = `\n[Images detected in tweet: ${images.length}] Please consider the visual content of the attached images when writing your reply.`;
  }

  const prompt = `System: You are an assistant that writes short, natural Twitter replies for a user. Use the user profile and tone to guide the style. Tone: ${tone} - ${tonePrompt}${imageContext}\nUSER: ${profileSummary}\nTweet: ${tweet_text}\n
Reply with 1 suggested reply that's short and uses the specified tone.`;
  return prompt;
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
      } catch (e) {
        console.warn('Failed to load user profile for optional auth', e);
        user = null;
      }
    }
    // If no user is available, use a neutral anonymous profile
    if (!user) {
      user = { displayName: 'WittyWing User', role: '', short_bio: '' };
    }

    const prompt = makePrompt(user, tweet_text, tone, images);
    console.info('Generation prompt using profile summary:', prompt);

    // Setup key pool (backwards compatible: support single key via GEMINI_API_KEY)
    const rawKeyList = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => (k || '').trim()).filter(Boolean);
    const apiKeys = Array.from(new Set(rawKeyList)); // unique

    // Multi-model pool configuration with RPM and RPD limits
    if (!global._geminiModelPool) {
      global._geminiModelPool = {
        models: [
          {
            name: 'gemini-2.5-flash-lite',
            endpoint: 'gemini-2.5-flash-lite:generateContent',
            rpm: 10,
            rpd: 20,
            counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
            disabledUntil: null,
            weight: 0.1 // Lower weight due to low RPD
          },
          {
            name: 'gemini-3-flash',
            endpoint: 'gemini-3-flash-preview:generateContent',
            rpm: 5,
            rpd: 20,
            counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
            disabledUntil: null,
            weight: 0.1
          },
          {
            name: 'gemini-2.5-pro',
            endpoint: 'gemini-2.5-pro:generateContent',
            rpm: 15,
            rpd: 1500,
            counters: { rpm: 0, rpd: 0, lastRpmReset: Date.now(), lastRpdReset: Date.now() },
            disabledUntil: null,
            weight: 0.35
          }
        ],
        keyState: { index: 0, disabled: {} }
      };
    }
    const geminiPool = global._geminiModelPool;

    // OpenRouter Free Model Pool for failover
    if (!global._orModelPool) {
      global._orModelPool = {
        models: [
          { name: 'google/gemma-3-27b-it:free', disabledUntil: null },
          { name: 'meta-llama/llama-3.3-70b-instruct:free', disabledUntil: null },
          { name: 'deepseek/deepseek-r1:free', disabledUntil: null },
          { name: 'qwen/qwen-3-235b-a22b-thinking:free', disabledUntil: null },
          { name: 'arcee-ai/trinity-large-preview:free', disabledUntil: null },
          { name: 'stepfun/step-3.5-flash:free', disabledUntil: null },
          { name: 'nvidia/nemotron-3-nano-30b-a3b:free', disabledUntil: null },
          { name: 'openai/gpt-oss-120b:free', disabledUntil: null }
        ],
        index: 0
      };
    }
    const orPool = global._orModelPool;

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

    async function callGeminiModelPool(p, images = []) {
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
            // Build multimodal request parts for Gemini (using simplified text context for now)
            const parts = [{ text: p }];

            const resp = await axios.post(modelUrl, { 
              contents: [{ parts: parts }],
              generationConfig: {
                maxOutputTokens: 150,
                temperature: 0.7
              }
            }, {
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


  function isSameDay(d1, d2) {
    if (!d1) return false;
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  async function getUserUsageDoc(userId) {
    const now = new Date();
    const user = await User.findById(userId).exec();
    if (!user) return null;
    if (!user.usage || !isSameDay(user.usage.lastReset, now)) {
      user.usage = user.usage || { dailyCount: 0, lastReset: now };
      user.usage.dailyCount = 0;
      user.usage.lastReset = now;
      await user.save();
    }
    return user;
  }

  async function getIpUsageDoc(ip) {
    const now = new Date();
    let rec = await IpUsage.findOne({ ip }).exec();
    if (!rec) {
      rec = new IpUsage({ ip, dailyCount: 0, lastReset: now });
      await rec.save();
      return rec;
    }
    if (!isSameDay(rec.lastReset, now)) {
      rec.dailyCount = 0;
      rec.lastReset = now;
      await rec.save();
    }
    return rec;
  }

  async function callOpenRouter(promptInput, options = {}) {
    const OR_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OR_API_KEY) return { error: 'no-or-key' };

    const orPool = global._orModelPool;
    const maxORAttempts = 5; 
    let orAttempts = 0;

    // Instructions for JSON format if structured is requested
    const structuredSystem = options.structured 
      ? `You MUST output ONLY a single JSON object matching: {"reply": string (<=280 chars), "tone": string (one of: ${Object.keys(tonePromptMap).join(', ')}), "reason": optional string (<=120 chars)}. Do not output any additional text, explanation, or markdown.`
      : "";

    while (orAttempts < maxORAttempts) {
      const modelObj = selectBestORModel();
      if (!modelObj) break;

      const modelName = modelObj.name;
      console.log(`[OR-Pool] Trying model: ${modelName} (Attempt ${orAttempts + 1}/${maxORAttempts})`);

      try {
        const combinedContent = structuredSystem ? `${structuredSystem}\n\nUser Request: ${promptInput}` : promptInput;
        
        // Prepare multimodal messages for models that support vision
        const messages = [];
        if (options.images && options.images.length > 0) {
            const content = [{ type: 'text', text: combinedContent }];
            // Add up to 3 images to the message for OpenRouter
            options.images.slice(0, 3).forEach(url => {
                content.push({ type: 'image_url', image_url: { url } });
            });
            messages.push({ role: 'user', content });
        } else {
            messages.push({ role: 'user', content: combinedContent });
        }

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: modelName,
          messages: messages,
          temperature: 0.7,
          max_tokens: 300
        }, {
          headers: {
            'Authorization': `Bearer ${OR_API_KEY}`,
            'HTTP-Referer': 'https://twitter-automation-zeta.vercel.app/',
            'X-Title': 'Twitter AI Reply Automation',
            'Content-Type': 'application/json'
          },
          timeout: 25000
        });

        const rawText = response.data?.choices?.[0]?.message?.content || "";
        let finalReply = rawText;

        // If structured was requested, try to parse JSON
        if (options.structured) {
          try {
            const cleanedText = rawText.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanedText);
            if (parsed && typeof parsed.reply === 'string') {
              finalReply = parsed.reply;
            }
          } catch (e) {
            console.warn(`[OR-Pool] JSON Parse failed for ${modelName}. Using raw text.`);
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
    // Determine client IP (respect X-Forwarded-For when present)
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.connection?.remoteAddress || '';

    // Usage limits
    const AUTH_DAILY_LIMIT = Number(process.env.AUTH_DAILY_LIMIT || 70);
    const AUTH_GEMINI_THRESHOLD = Number(process.env.AUTH_GEMINI_THRESHOLD || 5);
    const ANON_DAILY_LIMIT = Number(process.env.ANON_DAILY_LIMIT || 5);

    const isAuthenticated = !!(req.user && req.user._id);

    // Load usage record (auth user -> User.usage, anon -> IpUsage)
    let usageDoc = null;
    if (isAuthenticated) {
      usageDoc = await getUserUsageDoc(req.user._id);
      if (!usageDoc) {
        console.warn('Authenticated user not found for usage tracking:', req.user._id);
      }
      if (usageDoc && usageDoc.usage && usageDoc.usage.dailyCount >= AUTH_DAILY_LIMIT) {
        return res.status(429).json({ error: 'Daily generation limit reached' });
      }
    } else {
      usageDoc = await getIpUsageDoc(clientIp || 'unknown');
      if (usageDoc && usageDoc.dailyCount >= ANON_DAILY_LIMIT) {
        return res.status(429).json({ error: 'Daily generation limit reached for anonymous users' });
      }
    }

    // Helper to increment usage after a successful generation
    async function incrementUsage() {
      if (isAuthenticated) {
        if (!usageDoc.usage) usageDoc.usage = { dailyCount: 0, lastReset: new Date() };
        usageDoc.usage.dailyCount = (usageDoc.usage.dailyCount || 0) + 1;
        await usageDoc.save();
      } else {
        usageDoc.dailyCount = (usageDoc.dailyCount || 0) + 1;
        await usageDoc.save();
      }
    }

    // Routing logic:
    // - Authenticated: first AUTH_GEMINI_THRESHOLD calls -> Gemini; next up to AUTH_DAILY_LIMIT -> OpenRouter
    // - Anonymous: calls -> OpenRouter until ANON_DAILY_LIMIT
    let generated = null;
    let geminiAttempted = false;
    let openRouterAttempted = false;
    let geminiError = null;
    let openrouterError = null;

    if (isAuthenticated) {
      const currentCount = usageDoc?.usage?.dailyCount || 0;
      if (currentCount < AUTH_GEMINI_THRESHOLD && apiKeys.length > 0) {
        // Try Gemini model pool first
        geminiAttempted = true;
        try {
          const geminiResp = await callGeminiModelPool(prompt, images);
          if (geminiResp && geminiResp.text) {
            await incrementUsage();
            return res.json({ reply: geminiResp.text, prompt, model: geminiResp.model });
          }
          geminiError = geminiResp; // Includes backoff/exhausted info
        } catch (e) {
          geminiError = e.message || e;
        }
        
        // If Gemini failed due to 429/Exhaustion, we might want to wait or just proceed to OpenRouter
        if (geminiError?.backoffActive) {
          console.info('Proceeding to OpenRouter because Gemini pool is currently throttled.');
        }
      }

      // Use OpenRouter for remaining authenticated calls
      openRouterAttempted = true;
      try {
        const orResp = await callOpenRouter(prompt, { structured: true, tone: toneKey, images: images });
        if (orResp && orResp.text) {
          await incrementUsage();
          console.info(`Generation successful (Auth Tier) via OpenRouter [${orResp.model}]`);
          return res.json({ reply: orResp.text, prompt, model: orResp.model });
        }
        openrouterError = orResp || 'no-response';
      } catch (e) {
        openrouterError = e.message || e;
      }
    } else {
      // Anonymous users: default to OpenRouter
      openRouterAttempted = true;
      try {
        const orResp = await callOpenRouter(prompt, { structured: true, tone: toneKey, images: images });
        if (orResp && orResp.text) {
          await incrementUsage();
          console.info(`Generation successful (Anon Tier) via OpenRouter [${orResp.model}]`);
          return res.json({ reply: orResp.text, prompt, model: orResp.model });
        }
        openrouterError = orResp || 'no-response';
      } catch (e) {
        openrouterError = e.message || e;
      }
      
      // If OpenRouter failed, try Gemini as secondary fallback ONLY if keys not exhausted
      if (apiKeys.length > 0) {
        geminiAttempted = true;
        try {
          const geminiResp = await callGeminiModelPool(prompt, images);
          if (geminiResp && geminiResp.text) {
            await incrementUsage();
            return res.json({ reply: geminiResp.text, prompt, model: geminiResp.model });
          }
          geminiError = geminiResp || geminiError || 'no-response';
        } catch (e) {
          geminiError = e.message || e;
        }
      }
    }

    // If we attempted upstream services but none produced a usable reply, return 502 with diagnostics
    if ((geminiAttempted || openRouterAttempted)) {
      return res.status(502).json({ error: 'Upstream generation failed', details: { geminiAttempted, openRouterAttempted, geminiError, openrouterError } });
    }

    // Fallback deterministic reply
    let reply = '';
    // Use first project for fallback personalization when available
    const firstProject = (user && Array.isArray(user.projects) && user.projects.length > 0) ? user.projects[0] : null;
    const firstProjectName = firstProject && (firstProject.name || '').trim();
    switch (toneKey) {
      case 'Funny':
        reply = `😂 ${user.displayName || 'I'} would say: "That's hilarious!"`;
        break;
      case 'Sarcastic':
        reply = `Sure, because that's exactly what we needed today.`;
        break;
      case 'Sincere':
        reply = `That's really thoughtful; I appreciate you sharing this.`;
        break;
      case 'One-liner':
        reply = firstProjectName ? `${firstProjectName} — wow. Nailed it.` : `Wow. Nailed it.`;
        break;
      case 'Asking':
        reply = `Curious—how did you come up with this?`;
        break;
      case 'Friendly':
        reply = firstProjectName ? `Love this! Best of luck with ${firstProjectName} — hope you're doing well 😊` : `Love this! Hope you're doing well 😊`;
        break;
      case 'Thanking':
        reply = firstProjectName ? `Thanks — ${firstProjectName} really appreciates this!` : `Thanks so much—really appreciate it!`;
        break;
      default:
        reply = `Nice! Thanks for sharing.`;
    }

    return res.json({ reply, prompt });
  } catch (err) {
    console.error('Error generating reply:', err);
    res.status(500).json({ error: 'Generation failed', details: err.message });
  }
});

module.exports = router;
