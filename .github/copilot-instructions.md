## WittyWing — AI Agent Instructions

This file provides focused, actionable context to help AI coding agents be productive in this repository.

### Quick overview
- Project: WittyWing (Chrome extension)
- Purpose: Injects a "Generate Reply" button into Tweet reply dialogs and uses Google Gemini to produce reply text. The reply is copied to clipboard.
- Key files:
  - `manifest.json` — extension declaration & permissions (MV3)
  - `background.js` — service worker (core API calls, message handling, tone prompts)
  - `content.js` — content script (UI injection, DOM mutation observer, dialog handling)
  - `popup.js`, `popup.html` — user-facing popup (API key management + start automation)
  - `README.md`, `PRIVACY.md` (docs and privacy notice)

### Big picture architecture
- MV3 Chrome extension that runs a background service worker (`background.js`) and a content script (`content.js`). The popup manages configuration.
- Data flow:
  1. User opens the reply dialog in Twitter/X; `content.js` detects via MutationObserver.
  2. `content.js` injects a set of tone buttons and a `Generate Reply` button into the native action bar.
  3. On click, `content.js` reads the original tweet text and calls the background service worker via `chrome.runtime.sendMessage` with action `getReply`.
  4. `background.js` performs the request to Google Gemini, returns the AI-generated reply; `content.js` copies result to the clipboard.

### Message & API surface
- Standard internal message shape used by content <-> background:
  - startAutomation: { action: 'startAutomation' }
  - getReply: { action: 'getReply', tweetText, tweetId, tone }
  - isTweetReplied / markTweetAsReplied: { action: ..., tweetId }

- The background service worker uses `tonePromptMap` for mapping tones -> Gemini prompts. If you need a new tone, add a mapping here and also add the tone label into `content.js`’s `tones` array.

### Important project-specific patterns & conventions
- Idempotency & robustness:
  - `content.js` sets a single global guard `window.hasTwitterAutomationLLMContentScriptRun` to avoid re-loading.
  - `content.js` uses a `MutationObserver` + `waitForElement` with timeouts to reliably inject into dynamic Twitter UI.
- DOM injection:
  - Injected elements use unique IDs `#generate-reply-button` and `#tone-buttons-container` — use these IDs when finding/cleaning up injected UI.
  - A class `twitter-automation-processed` is added to processed reply dialogs; it is used to prevent re-injection.
- Message wrappers:
  - `sendMessageAsync` pattern is used as a promise wrapper for chrome.runtime.sendMessage. Keep this wrapper for new message types.
  - The extension no longer requires a client-side Gemini API key. The server manages a pool of Gemini API keys.
- Service worker state:
  - `repliedTweetIds` (Set stored in-memory) is used to avoid duplicate replies during the service worker lifetime (not persisted across restarts).

### Integration & security
- Gemini API calls:
  - `background.js` fetches: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` with header `X-goog-api-key: <key>` and 30s AbortController timeout.
  - Host permissions include Google Gemini endpoints (see `manifest.json`).
- Privacy & Keys:
  - API key is stored locally (`chrome.storage.local`) and not uploaded to any custom backend; do not introduce remote logging of the key.
  - Update `PRIVACY.md` if you change any data flows involving user keys or tweet content.

### Debugging & developer workflows (manual)
- Load extension locally (no build step):
  1. Open `chrome://extensions/` in Chromium-based browser.
 2. Enable Developer Mode.
 3. Click "Load unpacked" and select the repo folder.
- Debugging tips:
  - Background/service worker logs: Hit `Inspect views: service worker` in the extension panel to view background logs and console.
  - Content script logs: Open the page where the extension injects UI (twitter/x.com), open DevTools -> Console to see `content.js` logs.
  - Simulate renewal of service worker by reloading the extension, or call `navigator.serviceWorker.register` if needed.
  - If `content.js` reports context invalidation in logs, refresh the page and re-inject.

### How to make common changes
- Add a new tone:
  1. Edit `background.js` — add a new entry into `tonePromptMap` with your tone string -> prompt mapping.
  2. Edit `content.js` — add the label to the `tones` array and, if necessary, update the UI style.
  3. No background logic needed unless the call requires different API behaviors.

- Add rate limit or request retry logic:
  - Enhance `background.js` `generateReply` to retry on `429` with exponential backoff; keep 30s timeout and AbortController in place.

### Tests, CI, & build
- There are no automated tests or build scripts. The extension is static JS/HTML loaded as an unpacked extension. If you add a toolchain or tests: include instructions in `README.md` and add `manifest.json` version bump.

### Files to update when changing behavior
- UI change: update `content.js`, `popup.html`, and `popup.js` and include UI screenshot/description in README.
- API/Privacy/data flow changes: update `background.js` and `PRIVACY.md` accordingly, and note changes in `README.md`.
- Version and permission changes: update `manifest.json` and add a short changelog entry to `README.md`.

### Helpful TODOs for humans (and agents)
- Keep `tonePromptMap` and UI `tones` in sync (both `background.js` and `content.js`).
- If adding persistent reply state, don't rely solely on service worker in-memory Set; add `chrome.storage.local` if you want persistence.

### Quick search tokens
- Look for: `generate-reply-button`, `tone-buttons-container`, `tweetTextarea_0`, `tweetButton`, `tonePromptMap`, `getReply`, `startAutomation`, `isTweetReplied`, `markTweetAsReplied`.

### PR guidance
- Small UI updates: add screenshots in PR description.
- For behavior or privacy changes: update `PRIVACY.md` and describe the exact data flows in the PR.
- Update `manifest.json` version when shipping changes.

If anything here is unclear or you'd like me to add examples, unit test skeletons, or an automated local run script, tell me which item to expand next.
