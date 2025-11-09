// popup.js

// Promise wrapper for chrome.runtime.sendMessage
function sendMessageAsync(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => resolve(resp));
    } catch (e) {
      console.error('sendMessageAsync error:', e);
      resolve({ error: e.message });
    }
  });
}

// Helper to read stored Gemini API key using Promise
function getStoredKey() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['geminiApiKey'], (result) => resolve(result && result.geminiApiKey));
    } catch (e) {
      console.error('getStoredKey error:', e);
      resolve(undefined);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const startAutomationButton = document.getElementById('start-automation');
  const testApiKeyButton = document.getElementById('test-api-key');
  const statusMessage = document.getElementById('status-message');

  // Load saved API key
  try {
    const savedKey = await getStoredKey();
    if (savedKey) apiKeyInput.value = savedKey;
  } catch (e) {
    console.error('Error loading stored API key:', e);
  }

  // Function to validate API key format
  function isValidGeminiApiKey(apiKey) {
    // Basic format validation for Gemini API keys
    return apiKey && apiKey.trim().length > 20 && apiKey.startsWith('AIza');
  }

  // Function to test API key
  async function testApiKey(apiKey) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
        method: 'POST',
        headers: {
          'X-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          'contents': [
            {
              'parts': [
                {
                  'text': 'Hello, this is a test message.'
                }
              ]
            }
          ]
        })
      });

      return response.ok;
    } catch (error) {
      console.error('API test failed:', error);
      return false;
    }
  }

  testApiKeyButton.addEventListener('click', async () => {
    const geminiApiKey = apiKeyInput.value.trim();

    if (!geminiApiKey) {
      statusMessage.textContent = 'Please enter your Google Gemini API Key first.';
      statusMessage.style.color = 'red';
      return;
    }

    if (!isValidGeminiApiKey(geminiApiKey)) {
      statusMessage.textContent = 'Invalid API key format. Gemini API keys should start with "AIza".';
      statusMessage.style.color = 'red';
      return;
    }

    // Disable button and show testing status
    testApiKeyButton.disabled = true;
    testApiKeyButton.textContent = 'Testing...';
    statusMessage.textContent = 'Testing API key...';
    statusMessage.style.color = 'blue';

    const isValid = await testApiKey(geminiApiKey);

    // Re-enable button
    testApiKeyButton.disabled = false;
    testApiKeyButton.textContent = 'Test API Key';

    if (isValid) {
      statusMessage.textContent = 'API key is valid! ✅';
      statusMessage.style.color = 'green';
      // Auto-save valid API key
      chrome.storage.local.set({ geminiApiKey });
    } else {
      statusMessage.textContent = 'API key is invalid or expired. ❌';
      statusMessage.style.color = 'red';
    }
  });

  startAutomationButton.addEventListener('click', () => {
    const geminiApiKey = apiKeyInput.value.trim();

    if (!geminiApiKey) {
      statusMessage.textContent = 'Please enter your Google Gemini API Key.';
      statusMessage.style.color = 'red';
      return;
    }

    if (!isValidGeminiApiKey(geminiApiKey)) {
      statusMessage.textContent = 'Invalid API key format. Gemini API keys should start with "AIza".';
      statusMessage.style.color = 'red';
      return;
    }

    // Save API key
    chrome.storage.local.set({ geminiApiKey }, async () => {
      statusMessage.textContent = 'Gemini API Key saved. Starting automation...';
      statusMessage.style.color = 'green';
      // Send message to background script to start automation
      try {
        await sendMessageAsync({ action: 'startAutomation' });
      } catch (e) {
        console.error('Error starting automation:', e);
      }
    });
  });
}); 