#!/bin/bash

# WittyWing Backend - Vercel Deployment Script
# Run this script from the server directory

echo "🚀 WittyWing Backend - Vercel Deployment"
echo "=========================================="
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "✅ Vercel CLI installed"
echo ""

# Check if logged in
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "⚠️  Not logged in. Please login to Vercel:"
    vercel login
fi

echo "✅ Authenticated with Vercel"
echo ""

# Environment check
echo "📋 Environment Variables Checklist:"
echo "   The following must be set in Vercel Dashboard:"
echo "   - SESSION_SECRET"
echo "   - MONGO_URI"
echo "   - GOOGLE_CLIENT_ID"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - GOOGLE_CALLBACK_URL (update after first deploy)"
echo "   - GEMINI_API_KEYS"
echo ""

read -p "Have you set all environment variables in Vercel? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️  Please set environment variables at: https://vercel.com/dashboard"
    echo "   Then run this script again."
    exit 1
fi

echo "✅ Environment variables confirmed"
echo ""

# Deploy options
echo "🎯 Deployment Options:"
echo "   1. Preview deployment (test)"
echo "   2. Production deployment"
echo ""
read -p "Select option (1 or 2): " -n 1 -r
echo ""

if [[ $REPLY == "1" ]]; then
    echo "🚢 Deploying to preview..."
    vercel
elif [[ $REPLY == "2" ]]; then
    echo "🚢 Deploying to production..."
    vercel --prod
else
    echo "❌ Invalid option"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next Steps:"
echo "   1. Copy your Vercel deployment URL"
echo "   2. Update GOOGLE_CALLBACK_URL in Vercel Dashboard"
echo "   3. Add redirect URI to Google OAuth Console"
echo "   4. Update .env.production in extension root"
echo "   5. Update manifest.json host_permissions"
echo "   6. Build production extension: npm run build:prod"
echo ""
echo "🔗 Useful Links:"
echo "   Vercel Dashboard: https://vercel.com/dashboard"
echo "   Google Console: https://console.cloud.google.com/apis/credentials"
echo ""
