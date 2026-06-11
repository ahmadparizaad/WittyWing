#!/usr/bin/env node
// Posts the oldest due tweet from queue.json using a persistent, logged-in
// browser profile (your real Brave/Chrome, separate profile dir).
//
// Usage:
//   node post-tweet.mjs --login   open the browser, log in to X manually, close the window
//   node post-tweet.mjs           post the oldest due tweet (with a random human-ish delay)
//   node post-tweet.mjs --now     same, but skip the random delay (for manual testing)
//
// Posts at most ONE queue entry per run. A queue entry's "text" may be a
// string (single tweet) or an array of strings (thread, composed in one go).
//
// Safety properties:
// - lock file shared with the generator: no concurrent queue.json writes
// - exact-text dedup: an entry matching an already-posted entry is skipped
// - crash-safe posting: attempt_started_at is written BEFORE clicking Post;
//   if a run dies mid-post, the next run checks the profile timeline to
//   decide whether the tweet actually went out (recover) or not (retry)

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, textsOf, makeLog, loadQueue, saveQueue, acquireLock, releaseLock } from './lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(DIR, 'queue.json');
const PROFILE_DIR = path.join(os.homedir(), '.wittywing-poster', 'profile');
const LOCK_FILE = path.join(DIR, 'logs', '.queue.lock');
const MAX_JITTER_MINUTES = 12;

// First existing browser wins. Bundled Chromium is the last resort and
// requires `npx playwright install chromium`.
const BROWSERS = [
  { name: 'Brave', executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  { name: 'Chrome', channel: 'chrome' },
  { name: 'Chromium' },
];

const log = makeLog(path.join(DIR, 'logs', 'poster.log'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (q) => saveQueue(QUEUE_FILE, q);

async function launch() {
  let lastErr;
  for (const b of BROWSERS) {
    if (b.executablePath && !fs.existsSync(b.executablePath)) continue;
    try {
      const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        channel: b.channel,
        executablePath: b.executablePath,
        viewport: null,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      log(`launched ${b.name}`);
      return ctx;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no usable browser found');
}

async function loginMode() {
  const ctx = await launch();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://x.com/login');
  console.log('\nLog in to X in the opened window, then close the browser.\n');
  await new Promise((resolve) => ctx.on('close', resolve));
  log('login session saved to profile');
}

// True if an already-posted (or recovered) entry has the exact same text.
function isDuplicate(entry, queue) {
  const key = textsOf(entry).map(normalize).join('\n');
  return queue.some(
    (e) => e !== entry && e.posted_at && textsOf(e).map(normalize).join('\n') === key,
  );
}

async function postTweet(page, texts) {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  const compose = page.locator('[data-testid="SideNav_NewTweet_Button"]');
  try {
    await compose.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    throw new Error('not logged in — run: node post-tweet.mjs --login');
  }
  await sleep(1500 + Math.random() * 2500);
  await compose.click();

  for (let i = 0; i < texts.length; i++) {
    const box = page.locator(`[data-testid="tweetTextarea_${i}"]`);
    await box.waitFor({ state: 'visible', timeout: 10_000 });
    await box.click();
    await box.pressSequentially(texts[i], { delay: 20 + Math.random() * 35 });
    if (i < texts.length - 1) {
      await page.locator('[data-testid="addButton"]').click();
    }
  }

  await sleep(800 + Math.random() * 1500);
  await page.locator('[data-testid="tweetButton"]').click();
  // Composer disappearing is our success signal.
  await page.locator('[data-testid="tweetTextarea_0"]').waitFor({ state: 'hidden', timeout: 20_000 });
}

// Checks the account's own profile timeline for the first 60 normalized chars
// of the tweet. Returns true (found), false (not found), or 'unknown'
// (couldn't check — e.g. logged out). 'unknown' must NOT trigger a retry.
async function verifyPosted(page, firstText) {
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    const profileLink = page.locator('[data-testid="AppTabBar_Profile_Link"]');
    await profileLink.waitFor({ state: 'visible', timeout: 30_000 });
    await profileLink.click();
    await page.waitForSelector('[data-testid="tweetText"]', { timeout: 20_000 });
    const recent = await page.locator('[data-testid="tweetText"]').allInnerTexts();
    const target = normalize(firstText).slice(0, 60);
    return recent.some((t) => normalize(t).includes(target));
  } catch (err) {
    log(`verification failed: ${err.message ?? err}`);
    return 'unknown';
  }
}

async function main() {
  if (process.argv.includes('--login')) return loginMode();

  if (!acquireLock(LOCK_FILE)) {
    log('another poster/generator run holds the lock — exiting');
    return;
  }
  try {
    const queue = loadQueue(QUEUE_FILE);
    const now = new Date();

    // Attempts that started but never resolved (crash mid-post).
    const unresolved = queue.filter((e) => e.attempt_started_at && !e.posted_at);

    const due = queue
      .filter((e) => !e.posted_at && !e.attempt_started_at && !e.skipped_at && new Date(e.scheduled_at) <= now)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    // Pick the first postable due entry; skip duplicates/over-length for good.
    let entry = null;
    for (const e of due) {
      const over = textsOf(e).find((t) => t.length > 280);
      if (over) {
        e.skipped_at = now.toISOString();
        e.skip_reason = `tweet exceeds 280 chars (${over.length})`;
      } else if (isDuplicate(e, queue)) {
        e.skipped_at = now.toISOString();
        e.skip_reason = 'exact duplicate of an already-posted tweet';
      } else {
        entry = e;
        break;
      }
      log(`skipped "${e.id}" — ${e.skip_reason}`);
    }
    save(queue);

    if (!entry && unresolved.length === 0) {
      log('no tweets due — nothing to do');
      return;
    }

    if (entry && !process.argv.includes('--now')) {
      const jitter = Math.random() * MAX_JITTER_MINUTES * 60_000;
      log(`posting "${entry.id}" after ${(jitter / 60_000).toFixed(1)}min jitter (${due.length} due)`);
      await sleep(jitter);
    }

    const ctx = await launch();
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());

      // Resolve crashed attempts before posting anything new.
      for (const e of unresolved) {
        const verdict = await verifyPosted(page, textsOf(e)[0]);
        if (verdict === true) {
          e.posted_at = new Date().toISOString();
          e.recovered = true;
          log(`recovered "${e.id}" — found on profile, marked posted`);
        } else if (verdict === false) {
          delete e.attempt_started_at;
          log(`"${e.id}" not on profile — re-queued for next run`);
        } else {
          log(`could not verify "${e.id}" — leaving for manual review (check profile, then edit queue.json)`);
        }
        save(queue);
      }

      if (entry) {
        entry.attempt_started_at = new Date().toISOString();
        save(queue);
        const texts = textsOf(entry);
        try {
          await postTweet(page, texts);
        } catch (err) {
          // Clean failure (exception, browser alive): the post did not go
          // out, so clear the marker for a plain retry next run.
          delete entry.attempt_started_at;
          entry.last_error = String(err.message ?? err);
          save(queue);
          throw err;
        }
        entry.posted_at = new Date().toISOString();
        delete entry.attempt_started_at;
        delete entry.last_error;
        save(queue);
        log(`posted "${entry.id}" (${texts.length} tweet${texts.length > 1 ? 's' : ''})`);
      }
    } finally {
      await ctx.close();
    }
  } finally {
    releaseLock(LOCK_FILE);
  }
}

main().catch((err) => {
  log(`ERROR: ${err.message ?? err}`);
  process.exit(1);
});
