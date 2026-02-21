import { axios } from './libs/axios-esm.js';
import { SERVER_URL } from './src/config.ts';

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
  "Default": "Write a natural, concise reply as if you're responding to a friend's tweet. Don't sound robotic or overly formal.",
  "Funny": "Write a witty and playful reply. Use harmless sarcasm, puns, or light humor. Keep it short and meme-like.",
  "Sarcastic": "Reply with obvious exaggeration and dry wit. Your response should mock the tweet lightly without being mean. Keep it concise. Aim for 1-2 sentences.",
  "Sincere": "Respond in a heartfelt and genuine way. Be kind, thoughtful, and human. No exaggerations or jokes. Keep it to 1-2 sentences.",
  "One-liner": "Craft a punchy one-line reply that could go viral. Keep it under 15 words. No fluff.",
  "Asking": "Turn your reply into a thoughtful question or follow-up. Make it sound curious and engaging. Limit to one short question.",
  "Friendly": "Write a warm and casual reply like you're chatting with someone you like. Use emojis if natural. Keep it to a maximum of 2 sentences.",
  "Thanking": "Compose a short and grateful reply. Be polite and appreciative, but avoid sounding overly formal. Ensure it's a single, very brief sentence."
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
        console.log('getReply called with tone:', selectedTone, 'tweetTextLength:', request.tweetText && request.tweetText.length);
        // Always call the server generate endpoint first (server-side key pool manages limits)
        let reply = null;
        try {
          const { serverJwt } = await new Promise((resolve) => chrome.storage.local.get(['serverJwt'], resolve));
          console.log('serverJwt present:', !!serverJwt);
          const headers = {};
          if (serverJwt) headers['Authorization'] = `Bearer ${serverJwt}`;
          console.log('Calling server generate endpoint:', `${SERVER_URL}/api/generate`);
          const genResp = await axios.post(`${SERVER_URL}/api/generate`, { tweet_text: request.tweetText, tone: selectedTone }, { headers, withCredentials: true });
          console.log('Server generate status:', genResp && genResp.status);
          console.log('Server generate response data:', genResp && genResp.data);
          if (genResp && genResp.status >= 200 && genResp.status < 300) {
            reply = genResp.data && genResp.data.reply;
          } else {
            console.warn('Server generate failed with status', genResp && genResp.status);
          }
        } catch (err) {
          console.warn('Server generate failed, error:', err && (err.message || err.toString()));
          console.warn('Full error object:', err);
        }

        // Fallback deterministic reply (simple templates) if server failed
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