# WittyWing Chrome Extension

Automate your Twitter (X) replies with AI-powered, tone-customized responses using Google Gemini. This extension streamlines your engagement, letting you reply to tweets with a single click and a personalized touch.

---

## Features

- **AI-Powered Replies:** Generate natural, funny, sarcastic, sincere, or viral one-liner replies using Google Gemini.
- **Tone Selection:** Choose from multiple tones for each reply (Default, Funny, Sarcastic, Sincere, One-liner, Asking, Friendly, Thanking).
- **Clipboard Integration:** Replies are automatically copied to your clipboard for quick posting.
- **Seamless Twitter Integration:** Works on both x.com and twitter.com.
- **Persistent API Key Storage:** Your Gemini API key is securely stored and reused across sessions.
- **Robust Error Handling:** Handles API errors, rate limits, and Chrome extension context issues gracefully.
- **No Duplicate Buttons:** Advanced logic ensures only one set of reply/tone buttons per dialog.

---

## Installation

1. **Get a Gemini API Key:**
   - Visit [Google AI Studio](https://aistudio.google.com/app/apikey) and create a new API key (starts with `AIza`).
2. **Load the Extension:**
   - Download or clone this repository.
   - Go to `chrome://extensions/` in your browser.
   - Enable "Developer mode" (top right).
   - Click "Load unpacked" and select the project folder.
3. **Configure:**
   - Click the extension icon in Chrome.
   - Paste your Gemini API key.
   - Use "Test API Key" to verify, then click "Start Automation".

---

## Usage

1. **Open Twitter/X:**
   - Go to any tweet and click "Reply".
2. **Select Tone & Generate:**
   - Choose your desired tone.
   - Click "Generate Reply".
   - The AI-generated reply is copied to your clipboard—just paste and send!

---

## Troubleshooting

- **Extension context invalidated:** Refresh the page or reload the extension.
- **API key errors:** Ensure your key is valid, has sufficient quota, and is correctly pasted.
- **Double buttons:** Should not occur; if seen, refresh the page.
- **Rate limits:** Wait and try again if you hit API limits.

---

## Technical Details

- **Manifest Version:** 3
- **API:** Google Gemini 2.0 Flash
- **Storage:** Chrome Extension Local Storage
- **Supported Sites:** x.com, twitter.com
- **Timeout:** 30 seconds for API requests
- **Debounce Delay:** 100ms for button injection

---

## Version History

- **v1.0:** Initial release
- **v1.1:** Improved context and API key persistence
- **v1.2:** Fixed double button issue, added advanced debouncing and injection protection

---

## License

MIT License

---

## Credits

Developed by Ahmad and contributors. Powered by Google Gemini.

---

## Feedback & Contributions

Feel free to open issues or submit pull requests for improvements!

---

## Privacy Policy (GitHub Pages)

This project includes a Privacy Policy describing how the extension handles your Gemini API key and tweet text. To host the policy as a static page using GitHub Pages:

1. Go to your repository settings on GitHub.
2. Under "Pages", choose the `docs/` folder as the source and save.
3. After GitHub builds the site, the Privacy Policy will be available at:

   https://ahmadparizaad.github.io/twitter-automation/PRIVACY.html

Add this URL to your Chrome Web Store listing under "Privacy Policy" when publishing the extension.

If you prefer a custom domain, update the Pages settings accordingly and replace the URL above with your custom domain.
