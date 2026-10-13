# Recovery report: marketing/medium-automation (WittyWing)

The July 2026 session that built this folder is gone. Its only surviving trace is a tool-output log truncated to
~5000 characters per result, so large files could not be restored whole. The folder was never pushed to GitHub.

| File | Status |
|---|---|
| `lib.mjs`, `browser.mjs`, `article.mjs`, `article.test.mjs`, `inspect-medium.mjs`, `package.json`, `launchd/*.plist` | **Recovered verbatim** (complete Writes). `article.test.mjs` passes (15 tests). |
| `README.md` | **Recovered** (96 lines, 3 edits applied). One token was redacted in the log (`REST API` restored by guess). |
| `generate-article.mjs` | **Lines 1-146 recovered** (header, prompt, JSON sanitiser, `parseArticle`, `runClaude`). **The rest (retry loop, duplicate check, queue append, `main`) is a rewrite**, marked with a `RECOVERY NOTE`. 8 new tests with a stub `claude`; all pass. |
| `publish-article.mjs` | **Rebuilt (second pass).** Recovered from the log: header/safety design, `loginMode`, the DOM selection + toolbar helpers, heading/bold typing, tip-drawer dismissal, the live-confirmed Publish/topic/confirm steps and the canonical-URL logic. **Rewritten:** the run loop and crash recovery (mirrors `post-tweet.mjs`), title typing, the logged-in check, `verifyPublished`, `--dry-run`. Split into `markdown-lines.mjs` (recovered) and `publish-queue.mjs` (new, pure). Tests: 19 + 3 flow tests with a scripted fake page. **Not verified against live Medium.** |
| `queue.json` | Recovered as `[]`; the real queue contents (generated articles, published URLs) are lost. |

Publisher decisions worth knowing: an attempt that can't be verified after a crash blocks all further publishing until you fix `queue.json`; `--dry-run` opens no browser and writes nothing; first-bold-span-only and no-inline-code limits are original and logged. `recovered/publish-article.PARTIAL.txt` is kept only as reference.

Rewritten behaviour to double-check: entry fields (`id`, `keyword`, `title`, `body_markdown`, `tags`, `scheduled_at`,
`source`), 3 attempts, rejection of duplicate titles/keywords, `--dry-run`. Entries are due immediately.

Also lost elsewhere in WittyWing: `docs/index.html` (landing page, 1,456 lines, ~16% recoverable). The extension,
server and `marketing/automation` were already complete on GitHub (the transcripts held nothing newer).

The `com.wittywing.medium-weekly` launchd job is paused (see ~/recovery/PAUSED_LAUNCHD_JOBS.md). Before re-enabling it: run `npm install`, `node inspect-medium.mjs`, `node publish-article.mjs --login`, then one supervised
`generate-article.mjs` + `publish-article.mjs` cycle and confirm a real `published_url` is recorded. The plist runs both scripts unattended.
