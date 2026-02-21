# Twitter Automation - Server (Phase 0)

A minimal PoC backend for WittyWing.

## Features
- Google OAuth sign-in (PoC using passport-google-oauth20)
- GET /api/profile and POST /api/profile to manage a user's profile
- POST /api/generate to produce a suggested reply using the user's profile and selected tone
- Supports authentication via express-session cookie (used in browser) and JWT (returned on OAuth callback for extensions)
- Optional Gemini integration using GEMINI_API_KEYS env var (comma-separated) or single GEMINI_API_KEY for backwards compatibility. The server will rotate and perform failover on rate limits (429 RESOURCE_EXHAUSTED).
 - Axios used for external API calls to the Gemini API

## Setup
1. Copy `.env.example` to `.env` and fill values (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.)

2. Install dependencies:

```powershell
cd server
npm install
```

3. Run the server:

```powershell
npm run dev
```

4. For local testing with the extension, make sure the extension has `http://localhost:3000/*` host permission.

## Endpoints

## Notes
	- Ensure `GOOGLE_CALLBACK_URL` matches the redirect URI configured in your Google Console OAuth Client.
		For local development, `http://localhost:3000/auth/google/callback` is a good default (add it to the OAuth client allowed redirect URIs).
