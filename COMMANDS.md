# WittyWing — CLI Command Reference

Quick reference for all commands used to run, manage, and deploy WittyWing.

---

## 🖥️ Server

```bash
# Start dev server (from /server)
cd server && node index.js

# Start with auto-reload (if nodemon installed)
cd server && npx nodemon index.js

# Install server dependencies
cd server && npm install
```

---

## 👤 Admin Scripts

> Run from the `/server` directory. Requires `.env` with `MONGO_URI`.

```bash
# Check a user's plan, trial status, and credit balance
node scripts/user-status.js <email>
# Example:
node scripts/user-status.js mohammadahmad7003@gmail.com

# Add credits to a user (also sets plan to 'credits')
node scripts/add-credits.js <email> <amount>
# Example: add 100 credits
node scripts/add-credits.js mohammadahmad7003@gmail.com 100

# Credit packs (manual UPI payment flow):
#   Starter  → 100 credits  (₹49)
#   Popular  → 500 credits  (₹199)
#   Power    → 1500 credits (₹499)
```

---

## 🧩 Extension

```bash
# Install dependencies
npm install

# Dev build (watch mode)
npm run dev

# Production build → outputs to /dist
npm run build:prod

# Dev build (for testing without minification)
npm run build:dev

# Zip the contents of dist/ for Chrome Web Store (manifest.json must be at root)
cd dist && zip -r ../WittyWing-v1.3.2.zip * && cd ..
```

---

## 🌐 Landing Page

No build step — edit `index.html` and `privacy.html` directly at repo root.

```bash
# Preview locally
open index.html
# or
python3 -m http.server 8080  # then visit http://localhost:8080

# Deploy — just push to main, GitHub Pages auto-deploys
git push origin main
```

---

## 🔑 Environment Variables

### Server (`server/.env`)
```
MONGO_URI=mongodb+srv://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
REFRESH_TOKEN_SECRET=...
ADMIN_SECRET=...          # guards /api/credits/add endpoint
GEMINI_API_KEY=...        # fallback Gemini key for trial users
OPENROUTER_API_KEY=...
CLIENT_URL=https://ahmadparizaad.github.io
```

> On Render: add these under **Environment → Environment Variables**

---

## 🚀 Git / Deploy

```bash
# Standard commit
git add -A && git commit -m "type: description" && git push

# Commit types: feat | fix | refactor | docs | chore | perf

# Check current status
git status
git log --oneline -10
```

---

## 🔗 URLs

| Resource | URL |
|----------|-----|
| Landing page | https://ahmadparizaad.github.io/twitter-automation/ |
| Privacy policy | https://ahmadparizaad.github.io/twitter-automation/privacy.html |
| Pricing | https://ahmadparizaad.github.io/twitter-automation/#pricing |
| Backend (Render) | https://your-render-url.onrender.com |
| Chrome Web Store | https://chromewebstore.google.com |
| GitHub repo | https://github.com/ahmadparizaad/twitter-automation |
