import { axios } from './libs/axios-esm.js';
import { SERVER_URL } from './src/config.ts';

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

async function getFreshToken() {
  const result = await new Promise((resolve) =>
    chrome.storage.local.get(['serverJwt', 'refreshToken'], resolve)
  );
  const { serverJwt, refreshToken } = result;

  if (!serverJwt) return null;

  const payload = decodeJWT(serverJwt);
  const expiresInSeconds = payload?.exp ? payload.exp - Math.floor(Date.now() / 1000) : 0;

  // Token is still fresh — return it as-is
  if (expiresInSeconds > 120) return serverJwt;

  // Token is expiring soon — try to refresh
  if (!refreshToken) return serverJwt;

  try {
    const resp = await axios.post(`${SERVER_URL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = resp.data;
    if (accessToken) {
      chrome.storage.local.set({
        serverJwt: accessToken,
        refreshToken: newRefreshToken || refreshToken,
      });
      return accessToken;
    }
  } catch {
    // Refresh failed — return the existing token and let the server return 401
  }
  return serverJwt;
}

let automationRunning = false;
let repliedTweetIds = new Set();

// Keep the service worker alive
self.addEventListener('message', () => {
  // This helps prevent the service worker from being terminated
});

// Ensure service worker stays active longer
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
});

const tonePromptMap = {
  Default:
    "Write a natural, concise reply as if you're responding to a friend's tweet. Don't sound robotic or overly formal.",
  Funny:
    'Write a witty and playful reply. Use harmless sarcasm, puns, or light humor. Keep it short and meme-like.',
  Sarcastic:
    'Reply with obvious exaggeration and dry wit. Your response should mock the tweet lightly without being mean. Keep it concise. Aim for 1-2 sentences.',
  Sincere:
    'Respond in a heartfelt and genuine way. Be kind, thoughtful, and human. No exaggerations or jokes. Keep it to 1-2 sentences.',
  'One-liner':
    'Craft a punchy one-line reply that could go viral. Keep it under 15 words. No fluff.',
  Asking:
    'Turn your reply into a thoughtful question or follow-up. Make it sound curious and engaging. Limit to one short question.',
  Friendly:
    "Write a warm and casual reply like you're chatting with someone you like. Use emojis if natural. Keep it to a maximum of 2 sentences.",
  Thanking:
    "Compose a short and grateful reply. Be polite and appreciative, but avoid sounding overly formal. Ensure it's a single, very brief sentence.",
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action);

  if (request.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
    return true;
  } else if (request.action === 'getReply') {
    const selectedTone = request.tone || 'Default'; // Default to 'Default' if no tone is provided
    (async () => {
      try {
        console.log(
          'getReply called with tone:',
          selectedTone,
          'tweetTextLength:',
          request.tweetText && request.tweetText.length,
          'numImages:',
          request.images && request.images.length
        );
        // Always call the server generate endpoint first (server-side key pool manages limits)
        let reply = null;
        try {
          const serverJwt = await getFreshToken();
          console.log('serverJwt present:', !!serverJwt);
          const headers = {};
          if (serverJwt) headers['Authorization'] = `Bearer ${serverJwt}`;
          console.log('Calling server generate endpoint:', `${SERVER_URL}/api/generate`);
          const genResp = await axios.post(
            `${SERVER_URL}/api/generate`,
            { tweet_text: request.tweetText, images: request.images, tone: selectedTone },
            { headers, withCredentials: true }
          );
          console.log('Server generate status:', genResp && genResp.status);
          console.log('Server generate response data:', genResp && genResp.data);
          if (genResp && genResp.status >= 200 && genResp.status < 300) {
            reply = genResp.data && genResp.data.reply;
          } else {
            console.warn('Server generate failed with status', genResp && genResp.status);
          }
        } catch (err) {
          console.warn('Server generate failed, error:', err && (err.message || err.toString()));
          const status = err && err.response && err.response.status;
          const serverMsg =
            (err && err.response && err.response.data && err.response.data.message) ||
            (err && err.response && err.response.data && err.response.data.error);

          if (status === 401) {
            // Session expired — tell the user to sign in again; do NOT fall back to templates
            sendResponse({
              error: 'SESSION_EXPIRED',
              message:
                'Your session has expired. Please open the WittyWing extension and sign in again.',
              tweetId: request.tweetId,
            });
            return;
          } else if (status === 402 || status === 403) {
            // Credits exhausted or plan limit hit
            sendResponse({
              error: 'CREDITS_EXPIRED',
              message:
                serverMsg || "You've run out of credits. Please top up to keep generating replies.",
              tweetId: request.tweetId,
            });
            return;
          } else if (status >= 400) {
            // Other 4xx/5xx — surface the server message rather than silently falling back
            sendResponse({
              error: 'SERVER_ERROR',
              message:
                serverMsg || 'Something went wrong on the server. Please try again in a moment.',
              tweetId: request.tweetId,
            });
            return;
          }
          // Network / unknown error — fall through to template fallback below
        }

        // Fallback deterministic reply (simple templates) only for network/unknown errors
        if (!reply) {
          const toneKey = selectedTone || 'Default';
          switch (toneKey) {
            case 'Funny':
              reply = `😂 That got me laughing — love it!`;
              break;
            case 'Sarcastic':
              reply = `Right, because that's not suspicious at all.`;
              break;
            case 'Sincere':
              reply = `This is lovely — thank you for sharing.`;
              break;
            case 'One-liner':
              reply = `Well played.`;
              break;
            case 'Asking':
              reply = `How did you even come up with this?`;
              break;
            case 'Friendly':
              reply = `Love it — hope you're doing awesome! 😊`;
              break;
            case 'Thanking':
              reply = `Thanks — really appreciate it!`;
              break;
            default:
              reply = `Nice! Thanks for sharing.`;
          }
        }
        sendResponse({ reply: reply, tweetId: request.tweetId });
      } catch (error) {
        console.error('Error generating reply:', error);
        sendResponse({ error: error.message, tweetId: request.tweetId });
      }
    })();
    return true;
  } else if (request.action === 'markTweetAsReplied') {
    repliedTweetIds.add(request.tweetId);
    sendResponse({ success: true });
  } else if (request.action === 'isTweetReplied') {
    sendResponse({ replied: repliedTweetIds.has(request.tweetId) });
    return true;
  }

  // Default response for unhandled actions
  sendResponse({ error: 'Unknown action' });
});

// generateReply removed: server-side generation is used instead (server manages API keys/rate-limits)
