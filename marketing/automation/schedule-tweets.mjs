#!/usr/bin/env node
// Schedules pending queue entries on X itself, using the web composer's
// native "Schedule post" feature (free, the calendar icon). Once scheduled,
// X's servers post them at the right time — this Mac can be asleep or off.
//
// Intended to run weekly, right after generate-tweets.mjs. The daily
// post-tweet.mjs remains as a fallback: it skips anything scheduled here
// (scheduled_on_x_at set) and only posts what this script couldn't handle.
//
// Usage:
//   node schedule-tweets.mjs            schedule all pending single tweets
//   node schedule-tweets.mjs --dry-run  print the plan without a browser
//
// Limitations:
// - X's web scheduler cannot schedule threads — entries whose text is an
//   array are left in the queue for the daily poster.
// - Entries already due (or due within MIN_LEAD) get pushed 20-50 min out.
//
// Safety properties (mirror post-tweet.mjs):
// - shared lock file: no concurrent queue.json writes
// - exact-text dedup against posted AND already-scheduled entries
// - crash-safe: schedule_attempt_started_at is written BEFORE the final
//   click; an unresolved attempt is checked against x.com's "Unsent posts"
//   page on the next run and either marked scheduled or retried.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, textsOf, makeLog, loadQueue, saveQueue, acquireLock, releaseLock } from './lib.mjs';
import { launchBrowser } from './browser.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(DIR, 'queue.json');
const PROFILE_DIR = path.join(os.homedir(), '.wittywing-poster', 'profile');
const LOCK_FILE = path.join(DIR, 'logs', '.queue.lock');
const MIN_LEAD_MS = 20 * 60_000; // X needs the slot a bit in the future
const MAX_CONSECUTIVE_FAILURES = 2; // selectors probably broke — stop, leave rest to the poster

const log = makeLog(path.join(DIR, 'logs', 'scheduler.log'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (q) => saveQueue(QUEUE_FILE, q);

// True if a posted or already-scheduled entry has the exact same text.
function isDuplicate(entry, queue) {
  const key = textsOf(entry).map(normalize).join('\n');
  return queue.some(
    (e) => e !== entry && (e.posted_at || e.scheduled_on_x_at)
      && textsOf(e).map(normalize).join('\n') === key,
  );
}

// When to schedule an entry on X: its own slot, unless that's in the past or
// too close — then 20-50 min from now (keeps a late Sunday run working).
function targetTime(entry, now) {
  const slot = new Date(entry.scheduled_at);
  if (slot.getTime() - now.getTime() >= MIN_LEAD_MS) return slot;
  return new Date(now.getTime() + MIN_LEAD_MS + Math.random() * 30 * 60_000);
}

// Selecting by value with a label fallback survives X changing how the
// schedule-dialog options are encoded.
async function trySelect(sel, ...candidates) {
  for (const c of candidates.map(String)) {
    try { await sel.selectOption(c); return; } catch { /* try next */ }
    try { await sel.selectOption({ label: c }); return; } catch { /* try next */ }
  }
  throw new Error(`schedule dialog: could not select any of: ${candidates.join(', ')}`);
}

async function openComposer(page) {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  const compose = page.locator('[data-testid="SideNav_NewTweet_Button"]');
  try {
    await compose.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    throw new Error('not logged in — run: node post-tweet.mjs --login');
  }
  await sleep(1500 + Math.random() * 2500);
  await compose.click();
  // The home timeline has its own inline composer with the same
  // tweetTextarea_0 testid — scope everything to the modal dialog.
  const composer = page.locator('[role="dialog"]')
    .filter({ has: page.locator('[data-testid="tweetTextarea_0"]') })
    .first();
  const box = composer.locator('[data-testid="tweetTextarea_0"]').first();
  await box.waitFor({ state: 'visible', timeout: 10_000 });
  return { composer, box };
}

// X's schedule dialog (2026-06): #SELECTOR_1..3 = month/day/year,
// #SELECTOR_4..5 = hour/minute (24h). A 6th select means the 12-hour
// AM/PM variant. The ids are page-unique, so no dialog scoping needed.
async function setScheduleTime(page, when) {
  const sel = (n) => page.locator(`#SELECTOR_${n}`);
  await trySelect(sel(1), when.getMonth() + 1, when.toLocaleString('en-US', { month: 'long' }));
  await trySelect(sel(2), when.getDate());
  await trySelect(sel(3), when.getFullYear());
  const h = when.getHours();
  const m = when.getMinutes();
  if (await sel(6).count()) {
    await trySelect(sel(4), h % 12 === 0 ? 12 : h % 12);
    await trySelect(sel(5), m, String(m).padStart(2, '0'));
    await trySelect(sel(6), h < 12 ? 'AM' : 'PM');
  } else {
    await trySelect(sel(4), h, String(h).padStart(2, '0'));
    await trySelect(sel(5), m, String(m).padStart(2, '0'));
  }
}

async function scheduleTweet(page, text, when) {
  const { composer, box } = await openComposer(page);
  await box.click();
  await box.pressSequentially(text, { delay: 20 + Math.random() * 35 });
  await sleep(500 + Math.random() * 1000);

  const scheduleBtn = composer.locator('[data-testid="scheduleOption"]').first();
  try {
    await scheduleBtn.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new Error('scheduleOption button not found — native scheduling unavailable or selector changed');
  }
  await scheduleBtn.click();
  const confirm = page.locator('[data-testid="scheduledConfirmationPrimaryAction"]').first();
  await confirm.waitFor({ state: 'visible', timeout: 10_000 });

  await setScheduleTime(page, when);

  await confirm.click();
  await sleep(800 + Math.random() * 1200);
  // Same button testid as posting; its label is now "Schedule".
  await composer.locator('[data-testid="tweetButton"]').first().click();
  await box.waitFor({ state: 'hidden', timeout: 20_000 });
}

// Checks X's "Unsent posts" page for the first 60 normalized chars of the
// tweet. true / false / 'unknown' — 'unknown' must NOT trigger a retry.
async function verifyScheduled(page, firstText) {
  try {
    await page.goto('https://x.com/compose/post/unsent/scheduled', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    const body = await page.locator('body').innerText();
    return normalize(body).includes(normalize(firstText).slice(0, 60));
  } catch (err) {
    log(`verification failed: ${err.message ?? err}`);
    return 'unknown';
  }
}

async function main() {
  const now = new Date();
  const queue = loadQueue(QUEUE_FILE);

  // Attempts that started but never resolved (crash mid-schedule).
  const unresolved = queue.filter((e) => e.schedule_attempt_started_at && !e.scheduled_on_x_at && !e.posted_at);

  const pending = [];
  for (const e of queue) {
    if (e.posted_at || e.skipped_at || e.scheduled_on_x_at || e.attempt_started_at || e.schedule_attempt_started_at) continue;
    const texts = textsOf(e);
    if (texts.length > 1) {
      log(`"${e.id}" is a thread — X can't schedule threads, leaving it for the daily poster`);
      continue;
    }
    const over = texts.find((t) => t.length > 280);
    if (over) {
      e.skipped_at = now.toISOString();
      e.skip_reason = `tweet exceeds 280 chars (${over.length})`;
      log(`skipped "${e.id}" — ${e.skip_reason}`);
    } else if (isDuplicate(e, queue)) {
      e.skipped_at = now.toISOString();
      e.skip_reason = 'exact duplicate of an already-posted/scheduled tweet';
      log(`skipped "${e.id}" — ${e.skip_reason}`);
    } else {
      pending.push(e);
    }
  }
  pending.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  save(queue);

  if (process.argv.includes('--dry-run')) {
    for (const e of pending) {
      console.log(`${e.id} → schedule on X for ${targetTime(e, now).toLocaleString()}`);
    }
    if (unresolved.length) console.log(`${unresolved.length} unresolved attempt(s) would be verified`);
    return;
  }

  if (pending.length === 0 && unresolved.length === 0) {
    log('nothing to schedule — done');
    return;
  }
  log(`scheduling ${pending.length} tweet(s) on X (${unresolved.length} unresolved to verify)`);

  const ctx = await launchBrowser(PROFILE_DIR, log);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    for (const e of unresolved) {
      const verdict = await verifyScheduled(page, textsOf(e)[0]);
      if (verdict === true) {
        e.scheduled_on_x_at = new Date().toISOString();
        e.recovered = true;
        log(`recovered "${e.id}" — found in Unsent posts, marked scheduled`);
      } else if (verdict === false) {
        delete e.schedule_attempt_started_at;
        log(`"${e.id}" not in Unsent posts — re-queued for next run`);
      } else {
        log(`could not verify "${e.id}" — leaving for manual review (check x.com/compose/post/unsent/scheduled, then edit queue.json)`);
      }
      save(queue);
    }

    let consecutiveFailures = 0;
    for (const e of pending) {
      const when = targetTime(e, new Date());
      e.schedule_attempt_started_at = new Date().toISOString();
      save(queue);
      try {
        await scheduleTweet(page, textsOf(e)[0], when);
      } catch (err) {
        delete e.schedule_attempt_started_at;
        e.last_error = String(err.message ?? err);
        save(queue);
        consecutiveFailures++;
        log(`FAILED to schedule "${e.id}": ${e.last_error}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          log(`${consecutiveFailures} consecutive failures — aborting; remaining entries stay queued for the daily poster`);
          break;
        }
        continue;
      }
      consecutiveFailures = 0;
      e.scheduled_on_x_at = new Date().toISOString();
      e.scheduled_for = when.toISOString();
      delete e.schedule_attempt_started_at;
      delete e.last_error;
      save(queue);
      log(`scheduled "${e.id}" on X for ${when.toLocaleString()}`);
      await sleep(15_000 + Math.random() * 30_000);
    }
  } finally {
    await ctx.close();
  }
}

// Shares the queue lock with the poster/generator; the poster can hold it
// for up to ~15 min, so retry for a while before giving up.
async function run() {
  for (let attempt = 1; attempt <= 20; attempt++) {
    if (acquireLock(LOCK_FILE)) {
      try {
        await main();
      } finally {
        releaseLock(LOCK_FILE);
      }
      return;
    }
    log(`queue locked (attempt ${attempt}/20) — retrying in 60s`);
    await sleep(60_000);
  }
  throw new Error('could not acquire queue lock after 20 minutes');
}

run().catch((err) => {
  log(`ERROR: ${err.message ?? err}`);
  process.exit(1);
});
