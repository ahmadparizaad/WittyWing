# WittyWing Chrome Extension

Automate your Twitter (X) replies with AI-powered, tone-customized responses using Google Gemini. This extension streamlines your engagement, letting you reply to tweets with a single click and a personalized touch.

---

## Features

- **AI-Powered Replies:** Generate natural, funny, sarcastic, sincere, or viral one-liner replies using Google Gemini.
- **Tone Selection:** Choose from multiple tones for each reply (Default, Funny, Sarcastic, Sincere, One-liner, Asking, Friendly, Thanking).
- **Direct Reply Insertion:** Generated replies are inserted straight into X's reply box — no copy-paste needed (clipboard copy remains as a fallback).
- **Seamless Twitter Integration:** Works on both x.com and twitter.com.
* **Server-managed API Keys:** The extension no longer requires a local Gemini API key — the backend manages a pool of keys and rotates on quota limits.
- **Robust Error Handling:** Handles API errors, rate limits, and Chrome extension context issues gracefully.
- **No Duplicate Buttons:** Advanced logic ensures only one set of reply/tone buttons per dialog.

---

## Development Setup

The extension uses **React + TypeScript** with **Vite** and **CRXJS** for hot reloading during development.

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/ahmadparizaad/twitter-automation.git
cd twitter-automation

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env to set your VITE_API_URL
```

### Development

```bash
# Start development server with hot reload
npm run dev
```

Then load the extension in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

The popup will hot-reload as you make changes!

### Production Build

```bash
# Build for production
npm run build
```

The built extension will be in the `dist/` folder.

### Code Quality

```bash
# Lint the code
npm run lint

# Format the code
npm run format
```

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS
- **State Management:** Zustand
- **Drag & Drop:** @dnd-kit
- **Build Tool:** Vite + CRXJS
- **Fonts:** @fontsource (Inter, Poppins) - bundled for offline use
- **HTTP Client:** Axios

---

## Installation (Production)

1. **Install:**
   - Install the extension (or load as unpacked) and sign into the back-end (optional) to enable personalized replies. The server will manage Gemini API keys and rotate them as needed.
2. **Load the Extension:**
   - Download or clone this repository.
   - Go to `chrome://extensions/` in your browser.
   - Enable "Developer mode" (top right).
   - Click "Load unpacked" and select the project folder.
3. **Configure:**
   - Click the extension icon in Chrome.
   - Sign in via the popup (optional for personalized replies). Click "Start Automation" to begin.

---

## Usage

1. **Open Twitter/X:**
   - Go to any tweet and click "Reply".
2. **Select Tone & Generate:**
   - Choose your desired tone.
   - Click "Generate Reply".
   - The AI-generated reply appears directly in the reply box—review and send!

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
 - **API:** Google Gemini 2.0 Flash
 - **HTTP client (extension & server):** Axios (server uses real axios package; extension uses a minimal axios-like wrapper under `libs/`)
- **Storage:** Chrome Extension Local Storage
- **Supported Sites:** x.com, twitter.com
- **Timeout:** 30 seconds for API requests
- **Debounce Delay:** 100ms for button injection

## Server (Phase 0)

This repo includes a minimal PoC backend under `server/` that implements Google OAuth and server-side generation endpoints.

To run the server locally:
1. cd server
2. npm install
3. Create a `.env` based on `.env.example`
4. npm run dev

The popup uses this to sign the user in; after completing signin, the OAuth page will post a token to the extension.

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

> Quick link: View the hosted Privacy Policy — https://ahmadparizaad.github.io/twitter-automation/PRIVACY.html
