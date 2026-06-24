# Chrome Web Store Listing — WittyWing

> Last Updated: 2026-06-24

## Store Listing

**Extension Name**
WittyWing - AI Engagement Assistant for X

**Short Description**
Generate authentic, tone-matched replies on X (Twitter). Boost your engagement and grow your audience with a single click.

**Detailed Description**
WittyWing is a smart, productivity-focused browser extension that helps you draft authentic, context-aware replies on X (formerly Twitter) instantly using advanced AI models.

FEATURES
• One-Click Drafting — Generate natural replies directly inside the X reply box without copy-pasting.
• Eight Distinct Tones — Customize your response style. Select between Default, Funny, Sarcastic, Sincere, One-liner, Asking, Friendly, and Thanking to match your exact voice.
• Seamless Integration — The clean UI injection fits perfectly into x.com and twitter.com without interrupting your browsing flow.
• Secure Key Management — Built-in server-side API key rotation keeps your local credentials safe.

HOW TO USE
1. Navigate to x.com or twitter.com and click "Reply" on any post.
2. Select your desired tone from the WittyWing button panel below the reply box.
3. Click "Generate" to draft your reply. The AI-generated text will appear directly in the reply box.
4. Review, make any edits, and click reply to post!

PRIVACY & SAFETY
We respect your privacy. WittyWing only reads the specific post you are replying to to generate contextual reply suggestions. No user accounts, personal communication history, or API keys are stored, tracked, or shared with third parties.

PERMISSIONS
• storage — Saves your local extension preferences and options.
• clipboardWrite — Provides a secure fallback copy action if direct reply insertion is blocked by your browser settings.

SUPPORT
For feedback, bug reports, or suggestions, please visit our repository: https://github.com/ahmadparizaad/twitter-automation/issues or reach out to the developer.

Version 1.3.3 — Updated version with clean description and removed keyword-stuffing to resolve Yellow Argon policy violation.

**Category**
Productivity

**Single Purpose**
Generates and inserts context-aware reply drafts directly into X (Twitter) post inputs based on selected tones.

**Primary Language**
English


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ✅ Ready | `marketing/screenshot-1.png` |
| Screenshot 2 | 1280×800 or 640×400 | ✅ Ready | `marketing/screenshot-2.png` |
| Small Promo Tile | 440×280 | ✅ Ready | `marketing/promo-440x280.png` |


## Permissions Justification

Every permission used by WittyWing is required for its primary features:

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences such as preferred tones and user session status locally. |
| `clipboardWrite` | permissions | Copies generated replies to the clipboard as a fallback in case browser restrictions block direct input insertion. |
| `https://x.com/*` | host_permissions | Enables the content script to interact with and inject components on x.com. |
| `https://twitter.com/*` | host_permissions | Enables the content script to interact with and inject components on twitter.com. |
| `https://openrouter.ai/*` | host_permissions | Allows secure communication with OpenRouter APIs for reply generation if fallback is needed. |
| `https://generativelanguage.googleapis.com/*` | host_permissions | Allows secure communication with Google Gemini APIs for generating replies. |
| `https://twitter-automation-ek5d.onrender.com/*` | host_permissions | Used to connect to the backend server for user sign-in and server-side API key rotation. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes


## Privacy Policy

**Privacy Policy URL**
https://ahmadparizaad.github.io/twitter-automation/PRIVACY.html


## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free


## Developer Info

**Publisher Name**
WittyWing Developer

**Contact Email**
mohammadahmad7003@gmail.com

**Support URL / Email**
https://github.com/ahmadparizaad/twitter-automation/issues

**Homepage URL**
https://ahmadparizaad.github.io/twitter-automation/


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.3.3 | 2026-06-20 | Re-submitting with clean description and removed keyword-stuffing to resolve Yellow Argon violation. | Rejected |
| 1.3.3 | 2026-06-24 | Removed unused `activeTab` and `scripting` permissions to resolve Purple Potassium violation. | Draft |


## Review Notes

### Rejection History
| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| 2026-06-15 | Excessive keywords in store listing description (Yellow Argon rejection). | Rewrote store listing description to focus purely on features and user actions. Removed keyword lists. | 2026-06-20 |
| 2026-06-22 | Requested but unused `activeTab` and `scripting` permissions (Purple Potassium rejection). | Removed both permissions from manifest.json; verified no code references chrome.scripting or activeTab-dependent APIs. | 2026-06-24 |
