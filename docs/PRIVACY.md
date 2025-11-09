<div style="text-align: justify; max-width: 900px; margin: 0 auto; line-height: 1.6;">

## Privacy Policy — Twitter Automation LLM

**Last updated:** 2025-11-04

This Privacy Policy explains how the Twitter Automation LLM Chrome extension ("the Extension") collects, uses, and protects user data.

### 1. Data we collect

- **Gemini API Key:** The Extension stores your Google Gemini API key locally in your browser's extension storage (`chrome.storage.local`). This key is used only to call Google Gemini APIs from the background/service worker. The Extension does not transmit the API key to any third-party servers other than Google Gemini endpoints.
- **Local runtime data:** The Extension may temporarily read text from tweets displayed in your browser in order to generate replies. This text is sent to the Google Gemini API as part of the generation prompt and is not stored persistently by the Extension.

### 2. How we use your data

- The Gemini API key authenticates requests to the Google Gemini API to generate reply text. It is stored locally so you don't need to re-enter it each session.
- Tweet text is sent to Google Gemini to produce a reply. The Extension does not retain tweet content after generating the reply (except as required for the UI). The generated reply is copied to your clipboard; posting it is your choice.

### 3. Data sharing

- We do not share your Gemini API key or tweet text with any third parties other than Google Gemini (the API provider) when making API calls. We do not collect or transmit analytics, logs, or other user data to external servers.

### 4. Security

- The API key is stored in `chrome.storage.local` and is accessible only to the Extension. Do not share your API key with untrusted parties.
- We recommend using a dedicated API key with minimal permissions and monitoring your Google Cloud usage and quotas.

### 5. Deleting your data

- To remove your API key, open the Extension popup and delete the key, or uninstall the Extension. You can also clear extension storage via Chrome's settings.

### 6. Contact

- For questions or issues, open an issue in the project's repository or contact the developer via the repository.

### 7. Changes to this policy

- We may update this policy over time. The latest version will be included in the repository and linked from the Chrome Web Store listing.

</div>
