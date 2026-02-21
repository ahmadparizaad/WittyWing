Privacy Policy — WittyWing

Last updated: 2025-11-04

This Privacy Policy describes how the WittyWing Chrome extension ("the Extension") handles data.

1. Data we collect
- Gemini API Key: The Extension no longer requires or stores a Gemini API key locally. The server manages a pool of Gemini API keys and performs calls on behalf of users. The extension does not send any local API key to third parties.
- Local runtime data: The Extension may temporarily read text from tweets displayed in your browser (to generate replies). This text is sent to the Google Gemini API as part of the prompt and is not stored persistently by the Extension.

2. How we use your data
- The server manages Gemini API keys and performs authenticated requests to the Google Gemini API when the extension requests generation. The extension does not store or transmit your personal API key.
- Tweet text is sent to Google Gemini to produce a reply. The Extension does not retain tweet content after generating the reply (except as required for UI display). The generated reply is copied to your clipboard; it is up to you whether you post it.

3. Data sharing
- We do not share your Gemini API key or tweet text with any third parties other than Google Gemini (the API provider) when making API calls. We do not collect or transmit analytics, logs, or other user data to external servers.

4. Security
- The API key is stored in `chrome.storage.local` and is accessible only to the Extension. Do not share your API key with untrusted parties.
- We recommend using a dedicated API key with appropriate permissions and monitoring your Google Cloud usage and quotas.

5. Deleting your data
- The extension does not store a Gemini API key locally. To remove your profile or session data stored server-side, sign out via the popup or contact the server operator.

6. Contact
- For questions or issues, open an issue in the project's repository or contact the developer.

7. Changes to this policy
- We may update this policy over time. The latest version will be included in the repository and linked from the Chrome Web Store listing.
