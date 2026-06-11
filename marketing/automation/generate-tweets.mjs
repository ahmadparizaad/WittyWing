#!/usr/bin/env node
// Refills queue.json with the next 7 days of tweets, generated headlessly via
// the Claude CLI (`claude -p`). Intended to run weekly from cron.
//
// Usage: node generate-tweets.mjs [--dry-run]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, textsOf, makeLog, acquireLock, releaseLock } from './lib.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(DIR, 'queue.json');
const LOCK_FILE = path.join(DIR, 'logs', '.queue.lock');
const LOG_FILE = path.join(DIR, 'logs', 'generator.log');
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? path.join(os.homedir(), '.local', 'bin', 'claude');
const TWEETS_PER_WEEK = 7;
const STORE_URL = 'https://chromewebstore.google.com/detail/wittywing/nanmlpbedgfahicpngbhalhjokieoipa';

const log = makeLog(LOG_FILE);

function buildPrompt(recentTexts) {
  return `You are writing next week's X (Twitter) posts for WittyWing, a Chrome extension that drafts AI replies inside X's reply box (8 tones: funny, sarcastic, sincere, one-liner, asking, friendly, thanking, default; Gemini-powered; 3-day free trial with 10 replies/day, no card; then credits that never expire, 1 credit = 1 reply).

Campaign angle: replies — not posts — are the cheapest growth lever on X; WittyWing makes a good reply one click. Audience: indie builders and creators growing on X.

Write exactly ${TWEETS_PER_WEEK} standalone tweets:
- voice: lowercase, dry, specific, builder-to-builder; no hype, no emojis, no hashtags
- each tweet carries ONE idea: X growth via replies, build-in-public lessons from shipping a Chrome extension, onboarding/pricing philosophy, or the product itself
- at most 2 tweets mention WittyWing by name; at most 1 includes this link: ${STORE_URL} — the rest say "link in bio" or nothing
- hard limit 270 characters per tweet
- do NOT repeat ideas from these recent tweets:
${recentTexts.map((t) => `  - ${t.replace(/\n/g, ' ').slice(0, 120)}`).join('\n')}

Output ONLY a JSON array of ${TWEETS_PER_WEEK} strings. No markdown fences, no commentary.`;
}

function parseTweets(raw) {
  const cleaned = raw.replace(/```(json)?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error(`no JSON array in claude output: ${cleaned.slice(0, 200)}`);
  const arr = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(arr) || !arr.every((t) => typeof t === 'string')) {
    throw new Error('claude output is not an array of strings');
  }
  const valid = arr.filter((t) => t.length > 0 && t.length <= 280);
  if (valid.length < arr.length) log(`dropped ${arr.length - valid.length} over-length tweet(s)`);
  if (valid.length === 0) throw new Error('no valid tweets generated');
  return valid;
}

// Schedule one tweet per day at a random 09:00-11:30 local slot, starting the
// day after the last already-scheduled entry (or tomorrow, whichever is later).
function scheduleDates(queue, count) {
  const lastScheduled = queue.reduce((max, e) => {
    const d = new Date(e.scheduled_at);
    return d > max ? d : max;
  }, new Date(0));
  const start = new Date(Math.max(Date.now(), lastScheduled.getTime()) + 24 * 3600 * 1000);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    d.setHours(9, Math.floor(Math.random() * 150), 0, 0); // 09:00-11:30
    return d;
  });
}

function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const recent = queue.slice(-15).flatMap(textsOf);

  log('generating next week of tweets via claude -p ...');
  const res = spawnSync(CLAUDE_BIN, ['-p', buildPrompt(recent)], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 5 * 60_000,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`claude exited ${res.status}: ${res.stderr?.slice(0, 500)}`);

  // Hard dedup: drop any generated tweet whose exact text (normalized) is
  // already anywhere in the queue, posted or pending.
  const existing = new Set(queue.flatMap(textsOf).map(normalize));
  const tweets = parseTweets(res.stdout).filter((t) => {
    if (existing.has(normalize(t))) {
      log(`dropped exact duplicate: "${t.slice(0, 60)}..."`);
      return false;
    }
    return true;
  });
  if (tweets.length === 0) throw new Error('all generated tweets were duplicates — nothing queued');

  const dates = scheduleDates(queue, tweets.length);
  const entries = tweets.map((text, i) => ({
    id: `gen-${dates[i].toISOString().slice(0, 10)}`,
    text,
    scheduled_at: dates[i].toISOString(),
    posted_at: null,
    source: 'claude-cli',
  }));

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify([...queue, ...entries], null, 2) + '\n');
  log(`queued ${entries.length} tweets (${entries[0].id} → ${entries.at(-1).id})`);
}

// Shares a lock with post-tweet.mjs so the two never read-modify-write
// queue.json at the same time. The poster can hold it for up to ~15 min
// (jitter + posting), so retry for a while before giving up.
async function run() {
  for (let attempt = 1; attempt <= 20; attempt++) {
    if (acquireLock(LOCK_FILE)) {
      try {
        main();
      } finally {
        releaseLock(LOCK_FILE);
      }
      return;
    }
    log(`queue locked (attempt ${attempt}/20) — retrying in 60s`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('could not acquire queue lock after 20 minutes');
}

run().catch((err) => {
  log(`ERROR: ${err.message ?? err}`);
  process.exit(1);
});
