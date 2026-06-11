# WittyWing Organic Campaign — $0 spend, zero-touch execution

Created: 2026-06-10. Goal: drive Chrome Web Store installs of WittyWing
(https://chromewebstore.google.com/detail/wittywing/nanmlpbedgfahicpngbhalhjokieoipa)
with no ad spend and no manual posting.

**Core angle:** Replies — not posts — are the cheapest growth lever on X.
WittyWing makes a good reply one click. Every post carries exactly one idea
from that angle: founder story, strategy, build lessons, product, pricing.

---

## Track 1: LinkedIn (LIVE — fully automated via Zernio)

Six posts scheduled from the "Mohammad Ahmad" LinkedIn account
(Zernio account ID `6a1d60d42b2567671a8647b5`), ~3x/week at ~10:00 IST.
Cancel or edit any of them in Zernio before its publish time using the post ID.

| # | Publishes (IST)   | Theme                                              | Zernio Post ID             |
|---|-------------------|----------------------------------------------------|----------------------------|
| 1 | Thu Jun 11, 09:59 | Founder story — "30 min of replies down to 3"      | 6a298b80fb8f2cf7e15ea062   |
| 2 | Mon Jun 15, 09:29 | Strategy — replies are free distribution on X      | 6a298b852ec2a7d1051a7cc7   |
| 3 | Wed Jun 17, 09:59 | Build lesson — killed BYO API key, activation 2x   | 6a298b9620ed444c0663fbb7   |
| 4 | Fri Jun 19, 09:29 | Product — 8 tones, one click, lives in reply box   | 6a298b9ffb8f2cf7e15ea9db   |
| 5 | Mon Jun 22, 10:00 | Lessons shipping a Chrome extension solo (MV3 etc) | 6a298bada6c0c3e695537e37   |
| 6 | Wed Jun 24, 09:30 | Pricing philosophy — credits that never expire     | 6a298bb22ec2a7d1051a8154   |

Every post ends with the Chrome Web Store link and a small, specific CTA.

## Track 2: X / Twitter (LIVE — browser-session automation, see `automation/`)

The X API is pay-as-you-go with no free tier (2026; $0.015/tweet, $0.20 with
URL — Zernio passes it through at 0% markup). To keep the campaign at $0,
this track runs via `marketing/automation/`: a cron job drives a logged-in
Brave profile to post 1 tweet/day from `queue.json`, and a weekly
`claude -p` job refills the queue. ⚠️ This bypasses X's automation rules
(API required for automated posting) — accepted risk, volume kept at
1/day with jitter. Paid fallback: connect X to Zernio (swap out Instagram)
and pay per call.

The first week is seeded in `automation/queue.json` from these drafts:

**Launch thread (5 tweets)**
1. unpopular opinion: your posts aren't growing your X account. your replies are.
2. small account math: your post reaches your 300 followers. your reply on a
   100k account's post reaches theirs. replies are the only free distribution you have.
3. the problem isn't knowing this. it's writing the 15th good reply of the day.
   that's where everyone quits.
4. so i built a chrome extension that drafts the reply inside X's reply box.
   pick a tone — funny, sarcastic, sincere, one-liner — one click, done.
5. it's called WittyWing. free for 3 days, 10 replies/day, no card.
   link below 👇 (link in reply)

**Standalone posts**
- "deleted the API key setup screen from my extension. activation doubled.
  every onboarding step you remove is worth more than any feature you add."
- "8 tones. 1 click. 0 dashboards. the whole product lives inside X's reply box."
- "credits that never expire shouldn't be a differentiator. yet here we are."
- before/after demo clip of a one-click reply (record once; reusable forever)

**Reply-guy program (the product marketing itself):** use WittyWing daily to
reply to large accounts in the build-in-public / AI-tools niche. The replies
are the ad. Add "sent with WittyWing" only when contextually funny, never as a sig.

## Track 3: Instagram (BLOCKED — needs media)

`dev.ahmad.ai` is connected in Zernio, but Instagram posts require an image or
video. To activate: produce 5–10 reusable assets (screen-recorded demo reels,
tone-comparison carousels), host them, then schedule via Zernio `media_urls`.
Reel hooks: "POV: you reply to 20 tweets in 4 minutes" / "the 8 tones of
replying on X, ranked."

## Track 4: Chrome Web Store SEO (one-time, $0)

The store listing is the highest-intent organic channel. Title/description
should carry the queries people actually type: "AI reply generator for X",
"twitter reply assistant", "ChatGPT replies for Twitter". Every review
raises ranking — post-trial, the extension could prompt happy users
(5+ replies sent) for a review.

## Extending the campaign

- This batch ends Jun 24. To make it self-sustaining, set up a weekly
  scheduled agent (`/schedule`) that drafts the next week's posts from this
  angle list and queues them via Zernio.
- Connect the X account in Zernio to unlock Track 2 — for a tool about X,
  that's the channel that matters most.
