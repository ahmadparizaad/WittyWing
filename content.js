// content.js

// Idempotency check: Ensure the content script only runs once per page load
if (window.hasTwitterAutomationLLMContentScriptRun) {
  console.log("Twitter Automation LLM content script already loaded. Skipping re-initialization.");
} else {
  window.hasTwitterAutomationLLMContentScriptRun = true;

  // Health check function to test extension context
  async function isExtensionContextValid() {
    try {
      await chrome.runtime.sendMessage({ action: 'ping' });
      return true;
    } catch (error) {
      console.warn('Extension context not available:', error);
      return false;
    }
  }

  // Periodic health check to detect context invalidation
  let healthCheckInterval = setInterval(async () => {
    if (!(await isExtensionContextValid())) {
      console.warn('Extension context invalidated. Clearing interval.');
      clearInterval(healthCheckInterval);
      // Optionally show a toast notification
      showToast('Extension context lost. Please refresh the page for full functionality.', 10000);
    }
  }, 30000); // Check every 30 seconds

  // Add debouncing and safety variables for injection
  let injectionInProgress = false;
  let injectionTimeout = null;

  // Helper function to wait for an element to appear in the DOM
  function waitForElement(selector, timeout = 5000, condition = (el) => true) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          if (condition(element)) {
            clearInterval(interval);
            resolve(element);
          } else {
            // Log current state if condition is not met (e.g., button disabled)
            console.log(`Element found, but condition not met for ${selector}. Current state: disabled=${element.disabled}, aria-disabled=${element.getAttribute('aria-disabled')}`);
          }
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error(`Element with selector "${selector}" not found or condition not met within ${timeout}ms`));
        }
      }, 200); // Check every 200ms
    });
  }

  // Listen for messages from background.js (currently empty, but might be used in the future)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // This listener can be used for future communication from background.js if needed.
    // For example, if background.js needs to send a message to content.js.
  });

  // Function to clean up old buttons
  function cleanupOldButtons() {
    const oldGenerateButton = document.getElementById('generate-reply-button');
    const oldToneContainer = document.getElementById('tone-buttons-container');
    
    if (oldGenerateButton) {
      console.log('Removing old generate button');
      oldGenerateButton.remove();
    }
    if (oldToneContainer) {
      console.log('Removing old tone container');
      oldToneContainer.remove();
    }
    
    // Also clean up any processed modals that might be stale
    const processedModals = document.querySelectorAll('[role="dialog"][data-injected="true"]');
    processedModals.forEach(modal => {
      if (!modal.isConnected || !modal.querySelector('[data-testid="tweetTextarea_0"]')) {
        modal.removeAttribute('data-injected');
        modal.classList.remove('twitter-automation-processed');
      }
    });
  }

  // Function to inject the 'Generate Reply' button
  async function injectGenerateReplyButton() {
    // Prevent multiple simultaneous injections
    if (injectionInProgress) {
      console.log('Injection already in progress. Skipping.');
      return;
    }

    // Clear any pending injection timeout
    if (injectionTimeout) {
      clearTimeout(injectionTimeout);
    }

    // Set a small delay to debounce rapid calls
    injectionTimeout = setTimeout(async () => {
      injectionInProgress = true;
      
      try {
        // Clean up any existing buttons first
        cleanupOldButtons();
        
        // Check if the buttons already exist globally (not just in current dialog)
        const existingGenerateButton = document.getElementById('generate-reply-button');
        const existingToneContainer = document.getElementById('tone-buttons-container');
        
        if (existingGenerateButton && existingToneContainer) {
          console.log('Generate Reply button and Tone buttons already exist globally. Skipping re-injection.');
          return;
        }

        // Wait for the reply modal to appear first, as we need it for overall layout adjustments
        const replyModal = await waitForElement('[role="dialog"]', 10000);
        console.log('Reply modal found for layout adjustments.', replyModal);

        // Enhanced check for already processed modal
        if (replyModal.getAttribute('data-injected') === 'true' || 
            replyModal.querySelector('#generate-reply-button') ||
            replyModal.querySelector('#tone-buttons-container') ||
            replyModal.classList.contains('twitter-automation-processed')) {
          console.log('Reply modal already processed or contains buttons. Skipping re-injection.');
          return;
        }

        // Make the replyModal a flex column container to manage vertical layout.
        replyModal.style.display = 'flex';
        replyModal.style.flexDirection = 'column';
        replyModal.style.justifyContent = 'space-between'; // Distribute space between content and controls

        // Wait for the reply text area to appear, indicating the reply dialog is open
        const replyTextArea = await waitForElement('[data-testid="tweetTextarea_0"]', 10000);
        console.log('Reply text area found for button injection.', replyTextArea);

        // Find the main content wrapper (the part above the action bar) and make it grow
        // This is important to push the action bar and tone buttons to the bottom
        const mainContentWrapper = replyTextArea.closest('[role="dialog"] > div:first-child');
        if (mainContentWrapper) {
          mainContentWrapper.style.flexGrow = '1';
        } else {
          console.warn('Could not find main content wrapper within replyModal. Dialog expansion might be limited.');
        }

        // Find the send button, which is usually a stable element near where we want to inject.
        const sendButton = await waitForElement('[data-testid="tweetButton"]', 10000, (el) => true);
        console.log('Send button found for injection placement.', sendButton);

        // Define available tones
        const tones = ['Sarcastic', 'Funny', 'Asking', 'Sincere', 'One-liner', 'Friendly', 'Thanking', 'Default'];
        let selectedTone = 'Default'; // Initialize with a default tone

        // Create a container for tone buttons
        const toneButtonsContainer = document.createElement('div');
        toneButtonsContainer.id = 'tone-buttons-container';
        toneButtonsContainer.style.cssText = `
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
          width: 100%;
          margin-top: 10px;
          margin-bottom: 8px;
        `;

        // Create and append tone buttons
        tones.forEach(tone => {
          const toneButton = document.createElement('button');
          toneButton.textContent = tone;
          toneButton.className = 'tone-button';
          toneButton.style.cssText = `
            background-color: #2F3336;
            color: white;
            border: 1px solid #536471;
            border-radius: 9999px;
            padding: 3px 8px;
            font-weight: bold;
            cursor: pointer;
            font-size: 11px;
            white-space: nowrap;
          `;

          // Highlight the default selected tone
          if (tone === selectedTone) {
            toneButton.style.backgroundColor = '#1DA1F2';
            toneButton.style.borderColor = '#1DA1F2';
          }

          toneButton.addEventListener('click', () => {
            // Deselect previous button
            const prevSelectedButton = document.querySelector('.tone-button[style*="background-color: rgb(29, 161, 242)"]');
            if (prevSelectedButton) {
              prevSelectedButton.style.backgroundColor = '#2F3336';
              prevSelectedButton.style.borderColor = '#536471';
            }
            // Select current button
            toneButton.style.backgroundColor = '#1DA1F2';
            toneButton.style.borderColor = '#1DA1F2';
            selectedTone = tone;
            console.log(`Tone selected: ${selectedTone}`);
          });
          toneButtonsContainer.appendChild(toneButton);
        });

        // Create Generate Reply button
        const generateButton = document.createElement('button');
        generateButton.id = 'generate-reply-button';
        generateButton.textContent = 'Generate Reply';
        generateButton.style.cssText = `
          background-color: #1DA1F2;
          color: white;
          border: none;
          border-radius: 9999px;
          padding: 6px 12px;
          font-weight: bold;
          cursor: pointer;
          font-size: 14px;
        `;

        // Add click event listener to the button
        generateButton.addEventListener('click', async () => {
          console.log('Generate Reply button clicked!');

          // Check extension context before proceeding
          if (!(await isExtensionContextValid())) {
            alert('Extension context lost. Please refresh the page and try again.');
            return;
          }

          // Disable button during processing
          generateButton.disabled = true;
          generateButton.textContent = 'Generating...';

          try {
            let tweetText = null;
            // Attempt to find the main reply modal.
            const replyModal = await waitForElement('[role="dialog"]', 5000);
            console.log('Reply modal found for text extraction:', replyModal);

            if (replyModal) {
              // Get all tweetText elements within the modal.
              const allTweetTextElementsInModal = replyModal.querySelectorAll('[data-testid="tweetText"]');
              console.log('All [data-testid="tweetText"] elements in modal:', allTweetTextElementsInModal);

              // Iterate to find the original tweet's text, excluding the reply input area.
              for (const element of allTweetTextElementsInModal) {
                if (element.id !== replyTextArea.id && element.innerText.trim().length > 0) {
                  tweetText = element.innerText;
                  console.log('Extracted original tweet text:', tweetText);
                  break;
                }
              }

              if (!tweetText) {
                console.error('Could not find original tweet text within the modal after checking all elements.');
              }
            } else {
              console.error('Could not find the reply modal ([role="dialog"]).');
            }

            if (tweetText) {
              console.log('Requesting reply for tweet:', tweetText);
              
              // Retrieve API key from storage before sending the message
              const storedGeminiApiKey = await chrome.storage.local.get(['geminiApiKey']);
              const geminiApiKeyToSend = storedGeminiApiKey.geminiApiKey;
              
              if (!geminiApiKeyToSend) {
                alert('Gemini API Key not found in extension storage. Please set it via the extension popup.');
                console.error('Gemini API Key not found in storage.');
                return; 
              }

              try {
                const replyResponse = await chrome.runtime.sendMessage({ action: 'getReply', tweetText: tweetText, geminiApiKey: geminiApiKeyToSend, tone: selectedTone });
                if (replyResponse && replyResponse.reply) {
                  console.log('Generated reply received:', replyResponse.reply);

                  // Copy the reply to clipboard
                  await navigator.clipboard.writeText(replyResponse.reply);
                  console.log('Reply copied to clipboard.');

                  // Show toast message instead of alert
                  showToast('Reply generated and copied to clipboard! Please paste it (Ctrl+V/Cmd+V) and click "Reply".');

                } else if (replyResponse && replyResponse.error) {
                  console.error('Error generating reply:', replyResponse.error);
                  
                  // Check if it's an API key related error
                  if (replyResponse.error.includes('Invalid or expired API key') || 
                      replyResponse.error.includes('401') || 
                      replyResponse.error.includes('403')) {
                    alert(`API Key Error: ${replyResponse.error}\n\nPlease update your Gemini API key in the extension popup and try again.`);
                  } else {
                    alert(`Error generating reply: ${replyResponse.error}`);
                  }
                }
              } catch (error) {
                console.error('Extension context error:', error);
                if (error.message.includes('Extension context invalidated') || 
                    error.message.includes('Could not establish connection')) {
                  alert('Extension context lost. Please refresh the page and try again.');
                } else {
                  alert(`Communication error: ${error.message}\n\nPlease refresh the page and try again.`);
                }
              }
            } else {
              console.error('Could not extract tweet text.');
              alert('Could not extract tweet text to generate a reply.');
            }
          } finally {
            // Re-enable button
            generateButton.disabled = false;
            generateButton.textContent = 'Generate Reply';
          }
        });

        // Find the Twitter native action bar container (the direct parent of the sendButton)
        const twitterActionBar = sendButton.parentNode;

        if (twitterActionBar) {
          // Ensure the action bar is a flex container for horizontal layout of native and custom buttons
          twitterActionBar.style.display = 'flex';
          twitterActionBar.style.flexDirection = 'row';
          twitterActionBar.style.alignItems = 'center';
          twitterActionBar.style.justifyContent = 'flex-end';
          twitterActionBar.style.gap = '8px';

          // Insert generate button into the action bar, before the send button
          twitterActionBar.insertBefore(generateButton, sendButton);
          console.log('Generate Reply button injected successfully into action bar.');

          // Insert the toneButtonsContainer directly after the twitterActionBar
          const commonParentForActionBarAndTones = twitterActionBar.parentNode;

          if (commonParentForActionBarAndTones) {
            // Ensure the common parent is a flex container and stacks children vertically if it's not the replyModal
            if (commonParentForActionBarAndTones !== replyModal) {
              commonParentForActionBarAndTones.style.display = 'flex';
              commonParentForActionBarAndTones.style.flexDirection = 'column';
              commonParentForActionBarAndTones.style.alignItems = 'flex-end';
              commonParentForActionBarAndTones.style.width = '100%';
            }

            commonParentForActionBarAndTones.insertBefore(toneButtonsContainer, twitterActionBar.nextSibling);
            console.log('Tone buttons container injected after action bar.');

            // Mark the reply modal as injected and add a class for easier identification
            replyModal.setAttribute('data-injected', 'true');
            replyModal.classList.add('twitter-automation-processed');

          } else {
            console.error('Could not find common parent for action bar and tone buttons.');
          }

        } else {
          console.error('Could not find the native Twitter action bar container.');
        }      } catch (error) {
        console.error('Error injecting Generate Reply button and tone selectors:', error);
      } finally {
        injectionInProgress = false;
      }
    }, 100); // 100ms debounce delay
  }

  // Helper function to show a toast message
  function showToast(message, duration = 5000) {
    const toastId = 'twitter-automation-toast';
    let toastElement = document.getElementById(toastId);

    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.id = toastId;
      toastElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(29, 161, 242, 0.9); /* Twitter blue with transparency */
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000; /* Ensure it's on top */
        opacity: 0;
        transition: opacity 0.5s ease-in-out;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        text-align: center;
        max-width: 80%;
      `;
      document.body.appendChild(toastElement);
    }

    toastElement.textContent = message;
    toastElement.style.opacity = '1';

    setTimeout(() => {
      toastElement.style.opacity = '0';
      setTimeout(() => {
        if (toastElement.parentNode) {
          toastElement.parentNode.removeChild(toastElement);
        }
      }, 500); // Wait for fade-out transition to complete
    }, duration);
  }

  // Observe the DOM for changes to detect when reply dialogs appear
  const observer = new MutationObserver(mutations => {
    let shouldInject = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          // Check if the added node contains the reply text area or is the reply dialog itself
          if (node.nodeType === 1 && 
              (node.querySelector('[data-testid="tweetTextarea_0"]') || 
               node.matches('[data-testid="tweetTextarea_0"]') ||
               (node.matches('[role="dialog"]') && node.querySelector('[data-testid="tweetTextarea_0"]')))) {
            
            // Additional check: ensure this isn't already processed
            const parentDialog = node.closest('[role="dialog"]') || (node.matches('[role="dialog"]') ? node : null);
            if (parentDialog && !parentDialog.classList.contains('twitter-automation-processed')) {
              shouldInject = true;
              break;
            }
          }
        }
        if (shouldInject) break;
      }
    }
    
    if (shouldInject) {
      console.log('Reply dialog detected. Attempting to inject button.');
      injectGenerateReplyButton();
    }
  });

  // Start observing the body for changes
  observer.observe(document.body, { childList: true, subtree: true });
}