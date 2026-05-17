// content.js

// Idempotency check: Ensure the content script only runs once per page load
if (window.hasTwitterAutomationLLMContentScriptRun) {
  console.log('WittyWing content script already loaded. Skipping re-initialization.');
} else {
  window.hasTwitterAutomationLLMContentScriptRun = true;

  // Health check function to test extension context
  async function isExtensionContextValid() {
    try {
      const resp = await sendMessageAsync({ action: 'ping' });
      return !!(resp && resp.success);
    } catch (error) {
      console.warn('Extension context not available:', error);
      return false;
    }
  }

  // Promise-based wrapper for chrome.runtime.sendMessage
  function sendMessageAsync(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // In MV3, the callback may be invoked with undefined on error
          resolve(response);
        });
      } catch (e) {
        console.error('sendMessageAsync error:', e);
        resolve({ error: e.message });
      }
    });
  }

  // BYOK removed: the extension uses server-side managed Gemini keys, no local key storage is required.

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
  let injectionRetryCount = 0;
  const maxInjectionRetries = 5;
  let lastClickedTweetElement = null; // track last clicked tweet for fallback extraction

  // Helper function to wait for an element to appear in the DOM. Accepts single selector or an array of selectors.
  function waitForElement(selectorOrSelectors, timeout = 5000, condition = (el) => true) {
    const selectors = Array.isArray(selectorOrSelectors)
      ? selectorOrSelectors
      : [selectorOrSelectors];
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        let found = null;
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el) {
            found = el;
            break;
          }
        }
        if (found) {
          if (condition(found)) {
            clearInterval(interval);
            resolve(found);
          } else {
            // Log current state if condition is not met (e.g., button disabled)
            console.log(
              `Element found, but condition not met for ${selectors.join('|')}. Current state: disabled=${found.disabled}, aria-disabled=${found.getAttribute('aria-disabled')}`
            );
          }
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(
            new Error(
              `Element with selector "${selectors.join('|')}" not found or condition not met within ${timeout}ms`
            )
          );
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
    processedModals.forEach((modal) => {
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
          console.log(
            'Generate Reply button and Tone buttons already exist globally. Skipping re-injection.'
          );
          return;
        }

        // Try robust detection for reply textarea/dialog before assuming dialog role is present
        // The Twitter/X UI changes frequently; prefer targeting the reply textarea and tweet button directly.
        const replyTextAreaSelectorCandidates = [
          '[data-testid="tweetTextarea_0"]',
          'textarea[data-testid="tweetTextarea_0"]',
          'div[aria-label="Tweet text"]',
          'div[data-testid="tweetText"]',
          'textarea[aria-label="Tweet text"]',
        ];
        const replyModalSelectorCandidates = [
          '[role="dialog"]',
          'div[aria-modal="true"]',
          'div[data-testid="sheetDialog"]',
        ];

        // Wait for either the reply textarea or a dialog to appear
        const replyTextArea = await waitForElement(replyTextAreaSelectorCandidates, 15000).catch(
          () => null
        );
        const replyModal = replyTextArea ? replyTextArea.closest('[role="dialog"]') : null;
        // If replyModal still not found, try waiting for the dialog explicitly as fallback
        const dialog =
          replyModal ||
          (await waitForElement(replyModalSelectorCandidates, 10000).catch(() => null));
        if (!dialog) {
          // No dialog found; throw and let the caller handle
          throw new Error('Reply dialog not found via reply textarea or fallback dialog selectors');
        }
        console.log('Reply modal/dialog found for layout adjustments.', dialog);
        console.log('Reply modal found for layout adjustments.', replyModal);

        // Enhanced check for already processed modal
        if (
          replyModal.getAttribute('data-injected') === 'true' ||
          replyModal.querySelector('#generate-reply-button') ||
          replyModal.querySelector('#tone-buttons-container') ||
          replyModal.classList.contains('twitter-automation-processed')
        ) {
          console.log('Reply modal already processed or contains buttons. Skipping re-injection.');
          return;
        }

        // Make the replyModal a flex column container to manage vertical layout.
        replyModal.style.display = 'flex';
        replyModal.style.flexDirection = 'column';
        replyModal.style.justifyContent = 'space-between'; // Distribute space between content and controls

        // If we didn't discover the replyTextArea earlier, try to find it now (shorter timeout)
        const replyTextAreaFinal =
          replyTextArea ||
          (await waitForElement(replyTextAreaSelectorCandidates, 3000).catch(() => null));
        if (!replyTextAreaFinal) {
          console.warn(
            'Reply text area could not be found after dialog detection. Injection may not work reliably.'
          );
        } else {
          console.log('Reply text area found for button injection.', replyTextAreaFinal);
        }

        // Find the main content wrapper (the part above the action bar) and make it grow
        // This is important to push the action bar and tone buttons to the bottom
        const mainContentWrapper = replyTextArea.closest('[role="dialog"] > div:first-child');
        if (mainContentWrapper) {
          mainContentWrapper.style.flexGrow = '1';
        } else {
          console.warn(
            'Could not find main content wrapper within replyModal. Dialog expansion might be limited.'
          );
        }

        // Find the send button (tweetButton) within the dialog or the page
        const sendButtonSelectorCandidates = [
          '[data-testid="tweetButton"]',
          'div[data-testid="tweetButtonInline"]',
          'div[role="button"][data-testid*="tweet"]',
        ];
        const sendButton = await waitForElement(sendButtonSelectorCandidates, 10000).catch(
          () => null
        );
        if (!sendButton) {
          console.error(
            'Send button (tweetButton) not found — cannot inject the Generate Reply button.'
          );
          return;
        }
        console.log('Send button found for injection placement.', sendButton);

        // Define available tones
        const tones = [
          'Sarcastic',
          'Funny',
          'Asking',
          'Sincere',
          'One-liner',
          'Friendly',
          'Thanking',
          'Default',
        ];
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
        tones.forEach((tone) => {
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
            opacity: 1 !important;
            pointer-events: auto !important;
          `;

          // Highlight the default selected tone
          if (tone === selectedTone) {
            toneButton.style.backgroundColor = '#1DA1F2';
            toneButton.style.borderColor = '#1DA1F2';
          }

          toneButton.addEventListener('click', () => {
            // Deselect previous button
            const prevSelectedButton = document.querySelector(
              '.tone-button[style*="background-color: rgb(29, 161, 242)"]'
            );
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
          opacity: 1 !important;
          pointer-events: auto !important;
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
            // Attempt to find the main reply modal or textarea.
            const replyModal = await waitForElement(
              ['[role="dialog"]', 'div[aria-modal="true"]', 'div[data-testid="sheetDialog"]'],
              5000
            ).catch(() => null);
            console.log('Reply modal/dialog found for text extraction:', replyModal);

            // Helper to extract text from an element, making sure we ignore the reply textbox
            function extractTextFromElement(el) {
              if (!el) return null;
              const raw = el.innerText || '';
              const s = raw.trim();
              if (!s || s.length < 2) return null;
              // Remove common reply headers like 'Replying to @user'
              const cleaned = s
                .split('\n')
                .filter((line) => !/Replying to/i.test(line))
                .join(' ');
              return cleaned.trim() || null;
            }

            // Helper to extract image URLs from a tweet element
            function extractImagesFromElement(el) {
              if (!el) return [];
              const images = [];
              // Look for images in the tweet context (exclude user profile pics)
              const imgElements = el.querySelectorAll('img[src*="pbs.twimg.com/media"]');
              imgElements.forEach((img) => {
                if (img.src && !images.includes(img.src)) {
                  images.push(img.src);
                }
              });
              return images;
            }

            let tweetImages = [];

            // Try multiple strategies to robustly locate the original tweet text
            // 1) Look inside replyModal for article or tweet text elements
            if (replyModal) {
              // Check for article with tweetText
              const candidateSelectors = [
                'article[role="article"] [data-testid="tweetText"]',
                '[data-testid="tweetText"]',
                'div[lang]',
              ];
              for (const sel of candidateSelectors) {
                const els = replyModal.querySelectorAll(sel);
                for (const el of els) {
                  // ignore if it's the reply box / reply textarea
                  const isReplyBox =
                    !!el.closest && (el.closest('[role="textbox"]') || el.closest('textarea'));
                  if (isReplyBox) continue;
                  const txt = extractTextFromElement(el);
                  if (txt) {
                    tweetText = txt;
                    console.log(
                      'Extracted tweet text from modal using selector',
                      sel,
                      ':',
                      tweetText
                    );

                    // Also extract images from the closest article or the modal itself
                    const parentArticle = el.closest('article');
                    if (parentArticle) {
                      tweetImages = extractImagesFromElement(parentArticle);
                    } else {
                      tweetImages = extractImagesFromElement(replyModal);
                    }
                    break;
                  }
                }
                if (tweetText) break;
              }
            }

            // 2) Fall back to the last clicked tweet element (captured from reply click)
            if (!tweetText && lastClickedTweetElement) {
              const el =
                lastClickedTweetElement.querySelector('[data-testid="tweetText"]') ||
                lastClickedTweetElement.querySelector('div[lang]') ||
                lastClickedTweetElement.querySelector('article[role="article"]');
              const txt = extractTextFromElement(el);
              if (txt) {
                tweetText = txt;
                tweetImages = extractImagesFromElement(lastClickedTweetElement);
                console.log('Extracted tweet text from lastClickedTweetElement:', tweetText);
              }
            }

            // 3) Global fallback: find nearest [data-testid="tweetText"] on the page (first non-empty)
            if (!tweetText) {
              const allGlobals = document.querySelectorAll('[data-testid="tweetText"], div[lang]');
              for (const el of allGlobals) {
                const txt = extractTextFromElement(el);
                if (txt) {
                  tweetText = txt;
                  const parentArticle = el.closest('article');
                  if (parentArticle) {
                    tweetImages = extractImagesFromElement(parentArticle);
                  }
                  console.log('Global fallback: extracted tweet text:', tweetText);
                  break;
                }
              }
            }

            if (tweetText) {
              console.log('Requesting reply for tweet:', tweetText, 'with images:', tweetImages);

              // The extension will call the server for AI generation which manages API keys.
              // Check for server JWT if available to provide personalized profile
              const serverJwt = await new Promise((resolve) => {
                try {
                  chrome.storage.local.get(['serverJwt'], (result) =>
                    resolve(result && result.serverJwt)
                  );
                } catch (e) {
                  console.error('serverJwt read error:', e);
                  resolve(undefined);
                }
              });
              try {
                const headersObj = {}; // serverJwt is passed through storage, background.js will include it if present
                const replyResponse = await sendMessageAsync({
                  action: 'getReply',
                  tweetText: tweetText,
                  images: tweetImages,
                  tone: selectedTone,
                });
                if (replyResponse && replyResponse.reply) {
                  console.log('Generated reply received:', replyResponse.reply);

                  // Copy the reply to clipboard
                  await navigator.clipboard.writeText(replyResponse.reply);
                  console.log('Reply copied to clipboard.');

                  // Show toast message instead of alert
                  showToast(
                    'Reply generated and copied to clipboard! Please paste it (Ctrl+V/Cmd+V) and click "Reply".'
                  );
                } else if (replyResponse && replyResponse.error) {
                  console.error('Error generating reply:', replyResponse.error);
                  // Server-side error: show a generic notice to the user
                  alert(`Error generating reply: ${replyResponse.error}`);
                }
              } catch (error) {
                console.error('Extension context error:', error);
                if (
                  error.message.includes('Extension context invalidated') ||
                  error.message.includes('Could not establish connection')
                ) {
                  alert('Extension context lost. Please refresh the page and try again.');
                } else {
                  alert(
                    `Communication error: ${error.message}\n\nPlease refresh the page and try again.`
                  );
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

            // Create a wrapper row for the generate button that sits outside the dimmed action bar
            const generateButtonRow = document.createElement('div');
            generateButtonRow.style.cssText = `
              display: flex;
              justify-content: flex-end;
              width: 100%;
              margin-bottom: 4px;
            `;
            generateButtonRow.appendChild(generateButton);

            // Insert generate button row BEFORE the action bar (outside X's dimmed container)
            commonParentForActionBarAndTones.insertBefore(generateButtonRow, twitterActionBar);
            console.log('Generate Reply button injected successfully outside action bar.');

            commonParentForActionBarAndTones.insertBefore(
              toneButtonsContainer,
              twitterActionBar.nextSibling
            );
            console.log('Tone buttons container injected after action bar.');

            // Mark the reply modal as injected and add a class for easier identification
            replyModal.setAttribute('data-injected', 'true');
            replyModal.classList.add('twitter-automation-processed');
          } else {
            console.error('Could not find common parent for action bar and tone buttons.');
          }
        } else {
          console.error('Could not find the native Twitter action bar container.');
        }
      } catch (error) {
        console.error('Error injecting Generate Reply button and tone selectors:', error);
        // Retry a few times for transient races in the DOM building lifecycle
        try {
          if (
            injectionRetryCount < maxInjectionRetries &&
            error &&
            error.message &&
            (error.message.includes('not found') || error.message.includes('could not'))
          ) {
            injectionRetryCount++;
            const retryDelay = 500 * injectionRetryCount; // backoff: 500ms, 1000ms, 1500ms
            console.log(
              `Retrying injection in ${retryDelay}ms (attempt ${injectionRetryCount}/${maxInjectionRetries})...`
            );
            setTimeout(() => injectGenerateReplyButton(), retryDelay);
          } else {
            injectionRetryCount = 0;
          }
        } catch (retryErr) {
          console.warn('Retry scheduling failed', retryErr);
        }
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
  const observer = new MutationObserver((mutations) => {
    let shouldInject = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          // Check if the added node contains the reply text area or is the reply dialog itself
          if (
            node.nodeType === 1 &&
            (node.querySelector('[data-testid="tweetTextarea_0"]') ||
              node.matches('[data-testid="tweetTextarea_0"]') ||
              node.querySelector('[aria-label="Tweet text"]') ||
              node.querySelector('[data-testid="tweetText"]') ||
              (node.matches('[role="dialog"]') &&
                (node.querySelector('[data-testid="tweetTextarea_0"]') ||
                  node.querySelector('[aria-label="Tweet text"]'))))
          ) {
            // Additional check: ensure this isn't already processed
            const parentDialog =
              node.closest('[role="dialog"]') || (node.matches('[role="dialog"]') ? node : null);
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

  // As an additional reliability measure: detect user clicks on a "Reply" button
  // and attempt to inject the Generate Reply button after a short delay. This is
  // useful if the reply modal is created in response to a click rather than as a
  // mutation we detect immediately.
  document.addEventListener(
    'click',
    (e) => {
      try {
        const replyBtn =
          e.target &&
          e.target.closest &&
          (e.target.closest('[data-testid="reply"]') || e.target.closest('[aria-label="Reply"]'));
        if (replyBtn) {
          // Track the tweet element that was replied to, if available
          try {
            const clickedTweet =
              replyBtn.closest &&
              (replyBtn.closest('[data-testid="tweet"]') ||
                replyBtn.closest('article[role="article"]'));
            if (clickedTweet) lastClickedTweetElement = clickedTweet;
          } catch (err) {
            // ignore
          }
          // delay slightly to allow reply modal to open and be fully constructed
          setTimeout(() => injectGenerateReplyButton(), 300);
        }
      } catch (err) {
        // don't let a listener error break the page
        console.warn('Reply click detection handler error:', err);
      }
    },
    true
  );
}
