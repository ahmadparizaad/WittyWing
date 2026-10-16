# WittyWing X automation

Posting and scheduling moved to **x-agent** (`~/Projects/x-agent`,
github.com/ahmadparizaad/x-agent) on 2026-10-16. This folder now only holds
the content generator.

- **`generate-tweets.mjs`** — runs `claude -p` to write the next 7 days of
  tweets in the campaign voice and appends them to the queue (one per day,
  random 09:00–11:30 slot). With `XAGENT_HOME` set it writes into x-agent's
  `queue.json` and shares its lock; otherwise it uses `./queue.json`.
- **`queue.json`** — frozen history up to 2026-10-16 (copied into
  `~/.x-agent/queue.json`). Edit the live queue there, not here.

## Schedule

Both jobs live in `~/Projects/x-agent/launchd/` and run as @ahmadparizaad:

- `com.xagent.weekly` — Sun 20:00: this generator, then
  `x-agent schedule-pending` (hands singles to X's native scheduler).
- `com.xagent.run` — daily 09:30: `x-agent run` fallback (threads, failures).

Logs: `~/.x-agent/logs/` (`x-agent.log`, `launchd.log`) and
`logs/generator.log` here.

```bash
XAGENT_HOME=~/.x-agent node generate-tweets.mjs --dry-run   # preview without writing
```

`claude` CLI is expected at `~/.local/bin/claude`; override with `CLAUDE_BIN`.

⚠️ Automating X's web UI breaks X's automation rules; keep the 1/day cap.
