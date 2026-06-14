#!/usr/bin/env node
// One-off DOM inspection: opens the composer, clicks the schedule icon, and
// dumps the dialog HTML so we can fix selectors. Posts nothing.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { launchBrowser } from './browser.mjs';

const PROFILE_DIR = path.join(os.homedir(), '.wittywing-poster', 'profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await launchBrowser(PROFILE_DIR, console.log);
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="SideNav_NewTweet_Button"]').waitFor({ state: 'visible', timeout: 30_000 });
  await sleep(2000);
  await page.locator('[data-testid="SideNav_NewTweet_Button"]').click();
  await sleep(2500);

  const dialogs = page.locator('[role="dialog"]');
  console.log('dialogs after compose click:', await dialogs.count());
  console.log('textareas:', await page.locator('[data-testid="tweetTextarea_0"]').count());

  const sched = page.locator('[data-testid="scheduleOption"]');
  await sched.first().waitFor({ state: 'visible', timeout: 10_000 });
  await sched.first().click();
  await sleep(2500);

  let html = '';
  const n = await dialogs.count();
  for (let i = 0; i < n; i++) {
    html += `\n\n<!-- ===== dialog ${i} ===== -->\n` + (await dialogs.nth(i).innerHTML());
  }
  fs.writeFileSync('logs/schedule-dialog.html', html);
  console.log(`dumped ${n} dialog(s) to logs/schedule-dialog.html`);

  // Quick structural summary of form controls inside dialogs.
  const summary = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[role="dialog"] select, [role="dialog"] input').forEach((el) => {
      out.push({
        tag: el.tagName,
        type: el.getAttribute('type'),
        id: el.id,
        name: el.getAttribute('name'),
        testid: el.getAttribute('data-testid'),
        aria: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby'),
        value: el.value,
        options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0, 5).map((o) => `${o.value}|${o.label}`) : undefined,
        optionCount: el.tagName === 'SELECT' ? el.options.length : undefined,
      });
    });
    return out;
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await ctx.close();
}
