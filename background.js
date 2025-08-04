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
  } else if (request.action === 'startAutomation') {
    if (!automationRunning) {
      automationRunning = true;
      console.log('Automation started.');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          startContentScriptAutomation(tabs[0].id);
        } else {
          console.error('No active tab found.');
          automationRunning = false;
        }
      });
    }
    sendResponse({ success: true });
  } else if (request.action === 'getReply') {
    // Retrieve geminiApiKey and tone directly from the request object
    const currentGeminiApiKey = request.geminiApiKey;
    const selectedTone = request.tone || 'Default'; // Default to 'Default' if no tone is provided

    if (!currentGeminiApiKey) {
      console.error('Gemini API Key missing in getReply request.');
      sendResponse({ error: 'Gemini API Key missing.' });
      return true;
    }
    
    // Use async function and handle promises properly
    (async () => {
      try {
        const reply = await generateReply(request.tweetText, request.tweetId, currentGeminiApiKey, selectedTone);
        sendResponse({ reply: reply, tweetId: request.tweetId });
      } catch (error) {
        console.error('Error generating reply:', error);
        sendResponse({ error: error.message, tweetId: request.tweetId });
      }
    })();
    
    return true; // Will respond asynchronously
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

async function startContentScriptAutomation(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(`Script injection failed: ${chrome.runtime.lastError.message}`);
    } else {
      chrome.tabs.sendMessage(tabId, { action: 'startProcessing' });
    }
  });
}

async function generateReply(tweetText, tweetId, apiKey, tone) {
  const instruction = tonePromptMap[tone] || tonePromptMap["Default"];
  const prompt = `${instruction}\n\nHere is the tweet you're replying to:\n"${tweetText}"`;
  
  try {
    console.log('Using Gemini API Key:', apiKey ? '[Key Present]' : '[Key Missing]', 'with tone:', tone);
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'X-goog-api-key': `${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        'contents': [
          {
            'parts': [
              {
                'text': prompt
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { error: 'Unknown error response' };
      }
      
      // Check for API key related errors
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid or expired API key. Please check your Gemini API key in the extension popup.');
      }
      
      if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please wait a moment and try again.');
      }
      
      throw new Error(`API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response format from Gemini API');
    }
    
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API call failed:', error);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    
    throw error;
  }
} 