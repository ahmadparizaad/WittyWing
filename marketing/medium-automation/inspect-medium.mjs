#!/usr/bin/env node
// One-off DOM inspection: opens Medium's new-story editor and dumps its
// structure so we can fix publish-article.mjs's selectors against the real,
// current Medium UI. Publishes nothing. Run this once after `--login` and
// before relying on publish-article.mjs.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { launchBrowser } from './browser.mjs';

const PROFILE_DIR = path.join(os.homedir(), '.wittywing-medium', 'profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await launchBrowser(PROFILE_DIR, console.log);
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  const html = await page.locator('body').innerHTML();
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/medium-editor.html', html);
  console.log('dumped editor DOM to logs/medium-editor.html');

  // Quick structural summary: anything that looks like a title field, the
  // contenteditable body, and buttons/inputs relevant to publishing.
  const summary = await page.evaluate(() => {
    const describe = (el) => ({
      tag: el.tagName,
      testid: el.getAttribute('data-testid'),
      role: el.getAttribute('role'),
      contentEditable: el.getAttribute('contenteditable'),
      placeholder: el.getAttribute('placeholder') ?? el.getAttribute('data-default-value'),
      ariaLabel: el.getAttribute('aria-label'),
      className: el.className?.toString().slice(0, 80),
      text: el.textContent?.trim().slice(0, 40),
    });
    const out = { headings: [], contentEditables: [], buttons: [], inputs: [] };
    document.querySelectorAll('h1, h2, h3').forEach((el) => out.headings.push(describe(el)));
    document.querySelectorAll('[contenteditable="true"]').forEach((el) => out.contentEditables.push(describe(el)));
    document.querySelectorAll('button').forEach((el) => out.buttons.push(describe(el)));
    document.querySelectorAll('input').forEach((el) => out.inputs.push(describe(el)));
    return out;
  });
  console.log(JSON.stringify(summary, null, 2));

  console.log('\nNow click Publish manually in the opened window to also inspect the tag-picker dialog, then check logs/medium-editor.html and re-run if needed.');
  await sleep(2000);
} finally {
  await ctx.close();
}
