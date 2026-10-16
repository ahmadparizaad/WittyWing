# WittyWing Medium automation (organic content, keyword-driven)

A second, separate organic-growth track alongside `marketing/automation/`
(the X pipeline). Runs twice a week: research an underrated keyword in the AI
agents / automation niche via the OpenSEO MCP, write a full article for it,
and publish it to Medium — no human in the loop, same risk profile as the X
track.

1. **`generate-article.mjs`** (Sundays + Wednesdays 21:00) — runs `claude -p`
   headlessly. The prompt asks Claude to use its own OpenSEO MCP tools
   (already authorized via `claude mcp add --transport http --scope user
   openseo https://app.openseo.so/mcp`) to find an underrated keyword, then
   write a 1200-1800 word human-sounding article for it (no em dashes, no
   filler), and appends the result to `queue.json`.
2. **`publish-article.mjs`** (Sundays + Wednesdays 21:00, right after the
   generator) — opens the logged-in Medium browser profile and publishes the
   oldest due, unpublished queue entry via Medium's own story editor. Records
   `published_at` + `published_url`.

## Why this is a separate pipeline from `marketing/automation/`

Different platform, different credentials/profile, different cadence
mechanics (Medium has no native "schedule ahead" feature like X does, so
there's no scheduler/fallback-poster split — just generate then publish).
Shares only the platform-agnostic parts: `lib.mjs` (locking, queue
read/write, logging) and the `browser.mjs` persistent-profile pattern, both
copied rather than imported cross-directory to keep the two tracks fully
independent.

## OpenSEO MCP note

`app.openseo.so/mcp` is OAuth-protected, not a plain API-key REST API
Only the `claude` CLI (already `mcp add`-authorized for this user) holds a
valid session to it. `generate-article.mjs` therefore does not call OpenSEO
directly — it asks Claude to use its own `openseo` MCP tools as part of a
single `-p` invocation. If `claude mcp list` ever stops showing `openseo`,
re-run:

```bash
claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp
```

## NDA / company-work boundary (hard constraint)

`generate-article.mjs`'s prompt is seeded **only** with OpenSEO keyword
research and the last 8 queued article titles/keywords. It has no filesystem
access to any project's source and cannot see build activity in this or any
other repo. If build-log-derived topics are added later, they must read from
an explicit, user-maintained allowlist file (e.g. `personal-projects.txt`
naming only specific personal repos) — never an automatic scan of
`~/Projects` or similar, which would risk pulling in company/client code
under NDA.

## One-time setup (the only human steps)

```bash
cd marketing/medium-automation
npm install
node publish-article.mjs --login   # log in to Medium in the window that opens, then close it
node inspect-medium.mjs            # dump the real editor DOM so selectors in publish-article.mjs can be verified/fixed
node generate-article.mjs --dry-run   # sanity-check keyword + article without touching queue.json or Medium
```

**Before relying on this in production**, run one full manual cycle —
`node generate-article.mjs` (no flag) then `node publish-article.mjs` — and
confirm a real article goes live and `published_url` is recorded correctly.
Medium's editor selectors in `publish-article.mjs` are best-effort
placeholders until verified against `inspect-medium.mjs`'s output; expect to
need at least one round of selector fixes before this is reliable
unattended, the same way the X track's schedule-dialog selectors needed
`inspect-schedule.mjs` to nail down.

## Scheduling (launchd, not cron)

```bash
cp launchd/com.wittywing.medium-weekly.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.wittywing.medium-weekly.plist
```

Runs Sundays and Wednesdays 21:00 — one hour after the X track's weekly job
(20:00) so the two don't contend for CPU/network on the same machine.

To remove: `launchctl bootout gui/$(id -u)/com.wittywing.medium-weekly`, then
delete the plist from `~/Library/LaunchAgents/`.

## Operational notes

- **⚠️ ToS risk:** same category of risk as the X track — Medium's terms
  don't contemplate fully automated publishing via browser session. Volume
  is kept low (2 articles/week), typing is human-speed and jittered, and it's
  your real logged-in profile — but the risk is not zero.
- **Session expiry:** if Medium logs the profile out, runs fail with
  `not logged in` in `logs/publisher.log` — re-run
  `node publish-article.mjs --login`.
- **Editing the queue:** `queue.json` is plain JSON — edit/delete upcoming
  (unpublished) entries freely.
