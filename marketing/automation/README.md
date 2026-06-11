# WittyWing X automation ($0, browser-session posting)

Two cron jobs keep the X track of the organic campaign running with no API
costs and no manual posting:

1. **`post-tweet.mjs`** (daily 09:30) — opens your Brave browser with a
   dedicated logged-in profile (`~/.wittywing-poster/profile`), takes the
   oldest due entry from `queue.json`, types it like a human (threads
   supported), posts it, and marks it `posted_at`. Random 0–12 min jitter so
   posts don't land at the same second every day.
2. **`generate-tweets.mjs`** (Sundays 20:00) — runs `claude -p` headlessly to
   write the next 7 days of tweets in the campaign voice, validates length,
   and appends them to `queue.json` (one per day, random 09:00–11:30 slot).

## One-time setup (the only human steps)

```bash
cd marketing/automation
npm install
node post-tweet.mjs --login   # log in to X in the window that opens, then close it
node post-tweet.mjs --now     # optional: post the next due tweet immediately to verify
```

## Cron

```cron
30 9 * * * cd /Users/ahmadparizaad/Projects/twitter-automation/marketing/automation && /opt/homebrew/bin/node post-tweet.mjs >> logs/cron.log 2>&1
0 20 * * 0 cd /Users/ahmadparizaad/Projects/twitter-automation/marketing/automation && /opt/homebrew/bin/node generate-tweets.mjs >> logs/cron.log 2>&1
```

## Operational notes

- **⚠️ ToS risk:** X's automation rules require API usage for automated
  posting. Driving the web UI instead is against those rules and carries a
  suspension risk for the account. Volume is kept low (1 post/day), typing is
  human-speed, timing is jittered, and it's your real browser profile — but
  the risk is not zero. Don't raise the cadence.
- **Mac must be awake** at 09:30 / Sunday 20:00 — cron silently skips when
  asleep. Missed tweets stay "due" and post on the next run (one per run), so
  a skipped day self-heals a day later. For run-on-wake semantics, move the
  jobs to a launchd LaunchAgent with `StartCalendarInterval`.
- **Session expiry:** if X logs the profile out, runs fail with
  `not logged in` in `logs/poster.log` — re-run `node post-tweet.mjs --login`.
- **Editing the queue:** `queue.json` is plain JSON — edit/delete upcoming
  entries freely. `text` may be a string or an array of strings (thread).
  Hard limit 280 chars per tweet (free X account).
- **State machine per entry:** `posted_at` set = done; `skipped_at` set =
  permanently skipped (duplicate or over-length, see `skip_reason`);
  `attempt_started_at` set without `posted_at` = a run died mid-post — the
  next run checks the profile timeline and either marks it posted
  (`recovered: true`) or clears the marker to retry. If verification itself
  fails, the entry is left untouched and flagged in the log for manual review.
- **Dedup is enforced twice:** the generator drops any tweet whose exact
  normalized text already exists anywhere in the queue, and the poster
  refuses to post an entry matching an already-posted one (it gets
  `skipped_at` + `skip_reason`). Idea-level (non-exact) repetition avoidance
  remains prompt-based on the last 15 entries.
- **Locking:** both scripts take `logs/.queue.lock` before touching
  `queue.json`, so a cron run and a manual run can't race. Stale locks
  (>30 min, crashed run) are taken over automatically; the generator retries
  for up to 20 min if the poster holds the lock.
- **Selectors:** posting relies on X's `data-testid` attributes
  (`SideNav_NewTweet_Button`, `tweetTextarea_N`, `addButton`, `tweetButton`).
  If X renames them, update `postTweet()` in `post-tweet.mjs`.
- `claude` CLI is expected at `~/.local/bin/claude`; override with
  `CLAUDE_BIN` env var.
