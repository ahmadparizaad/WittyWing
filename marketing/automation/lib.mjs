// Shared helpers for post-tweet.mjs and generate-tweets.mjs.
import fs from 'node:fs';
import path from 'node:path';

// Whitespace- and case-insensitive form used for all duplicate comparisons.
export const normalize = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();

export const textsOf = (entry) => (Array.isArray(entry.text) ? entry.text : [entry.text]);

export function makeLog(logFile) {
  return (msg) => {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const line = `[${new Date().toISOString()}] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
    console.log(line);
  };
}

export const loadQueue = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const saveQueue = (file, q) => fs.writeFileSync(file, JSON.stringify(q, null, 2) + '\n');

// Both scripts share one lock so a poster run and a generator run can never
// read-modify-write queue.json concurrently. A lock older than staleMs is
// assumed to belong to a crashed run and is taken over.
export function acquireLock(lockFile, staleMs = 30 * 60_000) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    const age = Date.now() - fs.statSync(lockFile).mtimeMs;
    if (age > staleMs) {
      fs.writeFileSync(lockFile, String(process.pid));
      return true;
    }
    return false;
  }
}

export function releaseLock(lockFile) {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // already gone — fine
  }
}
