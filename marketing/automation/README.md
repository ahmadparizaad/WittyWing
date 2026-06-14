# WittyWing X automation ($0, browser-session posting)

The X track of the organic campaign runs with no API costs and no manual
posting. Since 2026-06-12 the design is **schedule-ahead**: tweets are handed
to X's own scheduler once a week, so they go out even when this Mac is
asleep or closed.

1. **`generate-tweets.mjs`** (Sundays 20:00) — runs `claude -p` headlessly to
   write the next 7 days of tweets in the campaign voice, validates length,
   and appends them to `queue.json` (one per day, random 09:00–11:30 slot).
2. **`schedule-tweets.mjs`** (Sundays 20:00, right after the generator) —
   opens the logged-in browser profile and schedules every pending single
   tweet via the composer's native **Schedule post** dialog (free feature,
   calendar icon). X's servers post them at their slots — the Mac can be
   off all week. Marks entries `scheduled_on_x_at`.
3. **`post-tweet.mjs`** (daily 09:30, fallback) — posts the oldest due entry
   that is *not* scheduled on X: threads (X can't schedule those) and
   anything the scheduler failed on. Skips `scheduled_on_x_at` entries, so
   it can never double-post. Human-speed typing, 0–12 min jitter.

## One-time setup (the only human steps)

```bash
cd marketing/automation
npm install
node post-tweet.mjs --login        # log in to X in the window that opens, then close it
node schedule-tweets.mjs --dry-run # sanity-check what would be scheduled
node schedule-tweets.mjs           # optional: schedule pending tweets now and watch it work
```

## Scheduling (launchd, not cron)

The jobs run as launchd LaunchAgents — unlike cron, launchd runs a missed
slot once on the next wake, so a Sunday spent asleep self-heals the moment
the Mac wakes up. Plists live in `launchd/` and are installed with:

```bash
cp launchd/com.wittywing.*.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.wittywing.weekly.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.wittywing.poster.plist
```

- `com.wittywing.weekly` — Sun 20:00: generate, then schedule on X.
- `com.wittywing.poster` — daily 09:30: fallback poster.

To remove: `launchctl bootout gui/$(id -u)/com.wittywing.weekly` (same for
poster), then delete the plists from `~/Library/LaunchAgents/`.

**Mac fully shut down over Sunday?** launchd does not replay slots missed
while *powered off* (only sleep). Either just open the Mac on Monday (the
weekly job fires on wake) or add a scheduled wake so it never misses:

```bash
sudo pmset repeat wakeorpoweron U 19:55:00   # wake/boot Sundays 19:55
```

## Operational notes

- **⚠️ ToS risk:** X's automation rules require API usage for automated
  posting. Driving the web UI instead is against those rules and carries a
  suspension risk for the account. Volume is kept low (1 post/day), typing is
  human-speed, timing is jittered, and it's your real browser profile — but
  the risk is not zero. Don't raise the cadence. (Using X's own Schedule
  button arguably lowers the daily surface area, but the weekly scheduling
  session is still automated browsing.)
- **Session expiry:** if X logs the profile out, runs fail with
  `not logged in` in `logs/poster.log` / `logs/scheduler.log` — re-run
  `node post-tweet.mjs --login`.
- **Editing the queue:** `queue.json` is plain JSON — edit/delete upcoming
  entries freely *unless* `scheduled_on_x_at` is set; those already live on
  X's side and must be edited/deleted at
  [x.com/compose/post/unsent/scheduled](https://x.com/compose/post/unsent/scheduled).
  `text` may be a string or an array of strings (thread; daily poster only).
  Hard limit 280 chars per tweet (free X account).
- **State machine per entry:** `posted_at` = posted live by the poster;
  `scheduled_on_x_at` (+ `scheduled_for`) = handed to X's scheduler, X will
  post it; `skipped_at` = permanently skipped (see `skip_reason`);
  `attempt_started_at` / `schedule_attempt_started_at` without a result = a
  run died mid-action — the next run verifies against the profile timeline
  (poster) or the Unsent-posts page (scheduler) and either marks it done
  (`recovered: true`) or clears the marker to retry. If verification itself
  fails, the entry is left untouched and flagged in the log for manual review.
- **Past-due entries at scheduling time** (e.g. the weekly run fired Monday
  after a missed Sunday) are scheduled 20–50 min out instead of their
  original slot.
- **Dedup is enforced in all three scripts:** the generator drops any tweet
  whose exact normalized text already exists anywhere in the queue; the
  scheduler and poster refuse to handle an entry matching an already
  posted-or-scheduled one (it gets `skipped_at` + `skip_reason`). Idea-level
  repetition avoidance remains prompt-based on the last 15 entries.
- **Locking:** all three scripts take `logs/.queue.lock` before touching
  `queue.json`, so runs can't race. Stale locks (>30 min, crashed run) are
  taken over automatically; the generator and scheduler retry for up to
  20 min if another run holds the lock.
- **Selectors:** posting relies on X's `data-testid` attributes
  (`SideNav_NewTweet_Button`, `tweetTextarea_N`, `addButton`, `tweetButton`,
  `scheduleOption`, `scheduledConfirmationPrimaryAction`) plus the schedule
  dialog's `#SELECTOR_1..5` selects (month/day/year + 24-hour hour/minute as
  of 2026-06; a 6th select would be the 12-hour AM/PM variant, handled too).
  The home timeline has an inline composer sharing `tweetTextarea_0`, so all
  composer interactions are scoped to the modal `[role="dialog"]`. If X
  changes the DOM again, run `node inspect-schedule.mjs` — it opens the
  schedule dialog and dumps its controls to `logs/schedule-dialog.html` plus
  a JSON summary. The scheduler aborts after 2 consecutive failures and
  leaves the rest to the daily poster, so a selector break degrades
  gracefully instead of dropping tweets.
- `claude` CLI is expected at `~/.local/bin/claude`; override with
  `CLAUDE_BIN` env var.
