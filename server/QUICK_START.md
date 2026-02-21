# Quick Start: Deploy WittyWing Backend to Vercel

## Prerequisites
- [ ] Vercel account created at https://vercel.com
- [ ] Vercel CLI installed: `npm i -g vercel`
- [ ] MongoDB Atlas connection string ready
- [ ] Google OAuth credentials ready

## Step 1: Install Vercel CLI (if not already)
```bash
npm install -g vercel
```

## Step 2: Login to Vercel
```bash
vercel login
```

## Step 3: Navigate to Server Directory
```bash
cd server
```

## Step 4: Install Dependencies (express-session removed)
```bash
npm install
```

## Step 5: Test Locally with Vercel Dev Server
```bash
vercel dev
```
Visit `http://localhost:3000` and test endpoints

## Step 6: Deploy to Vercel (Preview)
```bash
vercel
```
This creates a preview deployment. Copy the URL shown.

## Step 7: Set Environment Variables in Vercel
Go to your project in Vercel Dashboard → Settings → Environment Variables

Add these variables:
```
SESSION_SECRET=9d1749396df521dd1203b6305cb5275925fe2dec92db9e9447e2d76ae0f5e5a2
MONGO_URI=mongodb+srv://mohammadahmad8459_db_user:2jrA3gpbj3tKRryh@wittywing.twsmmwe.mongodb.net/
GOOGLE_CLIENT_ID=928996658122-peuo8siuaa8b42ctj8pkr3p07mvgrgma.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=https://YOUR-VERCEL-URL.vercel.app/auth/google/callback
GEMINI_API_KEYS=AIzaSyB2jyTGl2szAyk5XmsxzuamfY6-QB8lu7U
```

**Important:** Replace `YOUR-VERCEL-URL` with your actual Vercel deployment URL

## Step 8: Deploy to Production
```bash
vercel --prod
```

## Step 9: Update Google OAuth Console
1. Go to https://console.cloud.google.com/apis/credentials
2. Edit OAuth 2.0 Client ID
3. Add Authorized redirect URI:
   ```
   https://YOUR-VERCEL-URL.vercel.app/auth/google/callback
   ```
4. Save

## Step 10: Update Extension Configuration
Back in the project root directory:

1. Edit `.env.production`:
   ```env
   VITE_API_URL=https://YOUR-VERCEL-URL.vercel.app
   ```

2. Edit `manifest.json` - add to `host_permissions`:
   ```json
   "host_permissions": [
     "https://YOUR-VERCEL-URL.vercel.app/*",
     ...existing permissions...
   ]
   ```

3. Build production extension:
   ```bash
   npm run build:prod
   ```

## Step 11: Test Full Flow
1. Load extension from `dist/` folder in Chrome
2. Open extension popup
3. Sign in with Google
4. Edit your profile
5. Go to Twitter/X and test reply generation

## Verification Checklist
- [ ] `https://YOUR-URL.vercel.app/` returns JSON response
- [ ] `https://YOUR-URL.vercel.app/auth/config` shows OAuth configured
- [ ] Google OAuth sign-in works from extension
- [ ] Profile save/load works
- [ ] Reply generation works
- [ ] Token refresh works after 15 minutes

## Troubleshooting

### "Database unavailable" error
- Check MongoDB Atlas whitelist includes 0.0.0.0/0 (or Vercel IPs)
- Verify `MONGO_URI` is correct in Vercel environment variables

### OAuth callback fails
- Verify `GOOGLE_CALLBACK_URL` exactly matches Google Console redirect URI
- Check CORS settings allow extension origin
- Ensure all Google env vars are set in Vercel

### Function timeout
- Hobby plan has 10s timeout (may not be enough for Gemini)
- Upgrade to Pro plan for 60s timeout
- Or reduce Gemini timeout in code

### Extension can't connect
- Verify `VITE_API_URL` in `.env.production` is correct
- Verify `host_permissions` in `manifest.json` includes Vercel domain
- Rebuild extension after changes

## Useful Commands

```bash
# View deployment logs
vercel logs

# List deployments
vercel list

# Remove deployment
vercel remove [deployment-url]

# Open project dashboard
vercel

# Redeploy production
vercel --prod
```

## Cost Estimate
- **Vercel Hobby (Free):** Good for testing, 100 hours/month function execution
- **Vercel Pro ($20/mo):** Recommended for production, unlimited bandwidth, 60s timeout
- **MongoDB Atlas M0 (Free):** Up to 500 connections, 512MB storage

## Support
- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord
- MongoDB Atlas Support: https://www.mongodb.com/docs/atlas/

---

**Deployment Time Estimate:** 15-20 minutes end-to-end

**You're ready to deploy!** 🚀
