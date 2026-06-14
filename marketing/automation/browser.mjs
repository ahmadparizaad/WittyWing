// Shared browser launching for post-tweet.mjs and schedule-tweets.mjs.
// (Kept out of lib.mjs so the generator doesn't pay the playwright import.)
import { chromium } from 'playwright';
import fs from 'node:fs';

// First existing browser wins. Bundled Chromium is the last resort and
// requires `npx playwright install chromium`.
const BROWSERS = [
  { name: 'Brave', executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  { name: 'Chrome', channel: 'chrome' },
  { name: 'Chromium' },
];

export async function launchBrowser(profileDir, log) {
  let lastErr;
  for (const b of BROWSERS) {
    if (b.executablePath && !fs.existsSync(b.executablePath)) continue;
    try {
      const ctx = await chromium.launchPersistentContext(profileDir, {
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
