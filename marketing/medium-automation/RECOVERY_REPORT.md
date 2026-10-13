# Recovery report: marketing/medium-automation (WittyWing)

The July 2026 session that built this folder is gone. Its only surviving trace is a tool-output log truncated to
~5000 characters per result, so large files could not be restored whole. The folder was never pushed to GitHub.

| File | Status |
|---|---|
| `lib.mjs`, `browser.mjs`, `article.mjs`, `article.test.mjs`, `inspect-medium.mjs`, `package.json`, `launchd/*.plist` | **Recovered verbatim** (complete Writes). `article.test.mjs` passes (15 tests). |
| `README.md` | **Recovered** (96 lines, 3 edits applied). One token was redacted in the log (`REST API` restored by guess). |
| `generate-article.mjs` | **Lines 1-146 recovered** (header, prompt, JSON sanitiser, `parseArticle`, `runClaude`). **The rest (retry loop, duplicate check, queue append, `main`) is a rewrite**, marked with a `RECOVERY NOTE`. 8 new tests with a stub `claude`; all pass. |
| `publish-article.mjs` | **NOT recovered.** Only unusable fragments: `recovered/publish-article.PARTIAL.txt`. Needs a rewrite and a supervised run against Medium. |
| `queue.json` | Recovered as `[]`; the real queue contents (generated articles, published URLs) are lost. |

Rewritten behaviour to double-check: entry fields (`id`, `keyword`, `title`, `body_markdown`, `tags`, `scheduled_at`,
`source`), 3 attempts, rejection of duplicate titles/keywords, `--dry-run`. Entries are due immediately.

Also lost elsewhere in WittyWing: `docs/index.html` (landing page, 1,456 lines, ~16% recoverable). The extension,
server and `marketing/automation` were already complete on GitHub (the transcripts held nothing newer).

The `com.wittywing.medium-weekly` launchd job is paused (see ~/recovery/PAUSED_LAUNCHD_JOBS.md). Do not re-enable it
until `publish-article.mjs` exists: the plist runs `generate-article.mjs && publish-article.mjs`.
