#!/usr/bin/env node
// Publishes the oldest due, unpublished article from queue.json using a
// persistent, logged-in browser profile (separate from the X poster's
// profile). Mirrors marketing/automation/post-tweet.mjs's state machine.
//
// Usage:
//   node publish-article.mjs --login     open the browser, log in to Medium manually, close the window
//   node publish-article.mjs             publish the oldest due article
//   node publish-article.mjs --dry-run   show what would be published; opens no browser, writes nothing
//
// Publishes at most ONE queue entry per run.
//
// RECOVERY NOTE: the original file was lost. The header, the Medium editor helpers and their comments
// (live-confirmed selectors and quirks) are recovered from a truncated log; the run loop, crash recovery and
// the title/body wiring are a rewrite that mirrors post-tweet.mjs and are NOT verified against live Medium.
// Run `node inspect-medium.mjs` and one supervised cycle before trusting it unattended.
//
// Safety properties (mirror post-tweet.mjs):
// - lock file shared with the generator: no concurrent queue.json writes
// - crash-safe publishing: attempt_started_at is written BEFORE clicking
//   Publish; if a run dies mid-publish, the next run checks the profile's
//   story list to decide whether the article actually went out (recover) or
//   not (retry). An attempt that cannot be verified is left for manual review
//   and blocks further publishing until you resolve it in queue.json.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalize, makeLog, loadQueue, saveQueue, acquireLock, releaseLock } from './lib.mjs';
import { invalidReason } from './article.mjs';
import { planRun } from './publish-queue.mjs';
import { stripInlineCode, parseHeading, parseFirstBoldSegment } from './markdown-lines.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(DIR, 'queue.json');
const PROFILE_DIR = path.join(os.homedir(), '.wittywing-medium', 'profile');
const LOCK_FILE = path.join(DIR, 'logs', '.queue.lock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loginMode(log) {
  const { launchBrowser } = await import('./browser.mjs');
  const ctx = await launchBrowser(PROFILE_DIR, log);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://medium.com/m/signin');
  console.log('\nLog in to Medium in the opened window, then close the browser.\n');
  await new Promise((resolve) => ctx.on('close', resolve));
  log('login session saved to profile');
}

// ---- Medium editor helpers (recovered) -------------------------------------------------------------------
// Formatting works by selecting text and clicking Medium's floating toolbar: whole-line selection for headings
// (Medium's "h3" action, the larger of its two heading sizes) and single bold spans, both producing correctly
// formatted <h3>/<strong> output.

// (The first half of this comment is reconstructed; the second half is original.)
// Selects characters [start, end) of the paragraph that currently holds the DOM selection focus.
// Keyboard-based selection (Meta+Arrow "line start/end") is wrong for wrapped paragraphs: it selects only the
// visual line, not the paragraph. This was the exact failing case (a 47-character bold span at the start of a
// ~230 character wrapped paragraph), so the selection is built from the DOM instead and lands exactly right.
//
// Operates on whichever paragraph currently holds the DOM selection focus (found via closest() from
// window.getSelection().focusNode), so the caller must ensure focus is already in the right paragraph (true
// after typing into it, which is the only way this is used).
async function selectOffsetRangeDOM(page, start, end) {
  const result = await page.evaluate(({ start, end }) => {
    const sel = window.getSelection();
    const node = sel.focusNode;
    const container = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const para = container?.closest('[data-testid="editorParagraphText"], [data-testid="editorTitleParagraph"]');
    if (!para) return { ok: false, reason: 'no paragraph found from current selection focus' };

    // Walk the paragraph's text nodes to map flat character offsets to
    // (node, localOffset) pairs — handles a paragraph split across
    // multiple text nodes (e.g. one already containing a <strong> span).
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    let consumed = 0;
    let n;
    while ((n = walker.nextNode())) {
      const len = n.textContent.length;
      if (len === 0) continue; // zero-length text nodes contribute no offset
      if (startNode === null && consumed + len >= start) {
        startNode = n;
        startOffset = start - consumed;
      }
      if (endNode === null && consumed + len >= end) {
        endNode = n;
        endOffset = end - consumed;
      }
      consumed += len;
      if (startNode && endNode) break;
    }
    if (!startNode || !endNode) {
      return { ok: false, reason: `offset out of range (paragraph has ${consumed} chars, wanted ${start}-${end})` };
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    sel.removeAllRanges();
    sel.addRange(range);

    // Medium's floating format toolbar listens for real user interaction
    // events (a mouse-drag selection fires these naturally) — a Range set
    // purely via addRange() often leaves the toolbar hidden even though the
    // selection itself is completely correct. Confirmed live: dispatching
    // these two synthetic events after setting the range made the toolbar
    // appear reliably (5/5 trials) where it had previously been flaky.
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    para.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { ok: true };
  }, { start, end });

  if (!result.ok) throw new Error(`selectOffsetRangeDOM failed: ${result.reason}`);
  await sleep(250);
}

async function selectWholeLine(page) {
  const textLength = await page.evaluate(() => window.getSelection().focusNode?.textContent?.length ?? 0);
  await selectOffsetRangeDOM(page, 0, textLength);
}

// Verifies the live selection's text matches what was intended before
// formatting it — a single, generic check that catches focus having
// drifted to the wrong paragraph, an offset miscount, or any other
// selection bug, without needing to guard against each cause individually.
// Throws (caught by withToolbarRetry, which re-selects from scratch) rather
// than silently formatting whatever happens to be selected.
async function verifySelection(page, expectedText) {
  const actual = await page.evaluate(() => window.getSelection().toString());
  if (actual !== expectedText) {
    throw new Error(`selection mismatch before formatting: expected "${expectedText}", got "${actual}"`);
  }
}

// Collapses the cursor to the true end of the current paragraph's text —
// same wrapped-paragraph bug as selectOffsetRangeDOM's header comment
// describes applies to Meta+ArrowRight ("end of line") too, so this also
// uses the DOM directly rather than a keyboard shortcut.
async function collapseToParagraphEnd(page) {
  await page.evaluate(() => {
    const sel = window.getSelection();
    const node = sel.focusNode;
    const container = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const para = container?.closest('[data-testid="editorParagraphText"], [data-testid="editorTitleParagraph"]');
    if (!para) return;
    const range = document.createRange();
    range.selectNodeContents(para);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await sleep(150);
}

async function clickToolbarAction(page, action) {
  const btn = page.locator(`button[data-action="${action}"]`).first();
  await btn.waitFor({ state: 'visible', timeout: 8_000 });
  await btn.click();
  await sleep(400);
}

// The toolbar occasionally fails to render for a selection despite the
// selection itself being correct — confirmed intermittent in live testing
// (identical code succeeded on some runs, failed on others with no
// reproducible trigger). reselect() re-does the whole selection from
// scratch (not just re-waiting on the existing one) since a stale/collapsed
// selection is the most likely cause. Only wraps the two format-and-click
// steps, not the surrounding typing, so a retry never re-types text.
async function withToolbarRetry(reselect, action, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await reselect();
      await clickToolbarAction(action.page, action.name);
      return;
    } catch (err) {
      lastErr = err;
      action.log?.(`toolbar action "${action.name}" attempt ${i}/${attempts} failed: ${err.message ?? err}`);
    }
  }
  throw lastErr;
}

async function typeParagraph(page, rawLine, log) {
  const line = stripInlineCode(rawLine);
  const heading = parseHeading(line);
  if (heading !== null) {
    await page.keyboard.type(heading, { delay: 12 + Math.random() * 15 });
    await sleep(300);
    await withToolbarRetry(
      async () => {
        await selectWholeLine(page);
        await verifySelection(page, heading);
      },
      { page, name: 'h3', log },
    );
    await collapseToParagraphEnd(page);
    return;
  }

  const { plainText, boldRange, droppedCount } = parseFirstBoldSegment(line);
  if (droppedCount > 0) {
    log?.(`only the first bold span in "${line.slice(0, 50)}..." was formatted — ${droppedCount} additional bold marker(s) stripped and left as plain text (known limit: formatting a 2nd bold span in a line with an existing <strong> reliably breaks Medium's toolbar selection)`);
  }
  await page.keyboard.type(plainText, { delay: 12 + Math.random() * 15 });
  await sleep(300);
  if (boldRange) {
    const expectedBoldText = plainText.slice(boldRange.start, boldRange.end);
    await withToolbarRetry(
      async () => {
        await selectOffsetRangeDOM(page, boldRange.start, boldRange.end);
        await verifySelection(page, expectedBoldText);
      },
      { page, name: 'bold', log },
    );
    await collapseToParagraphEnd(page);
  }
}

// Types markdown into Medium's story body. Medium's title and body share ONE
// contenteditable container (a series of <h3>/<p> "graf" elements) — title
// is the leading <h3 data-testid="editorTitleParagraph">, body paragraphs
// are siblings created as you type and press Enter. There IS a second
// `[contenteditable="true"]` element elsewhere in the DOM, but it's an
// off-screen (x: -9999) decoy/utility element, not a visible body field —
// confirmed live: clicking it always failed with a Playwright "element is
// outside of the viewport" timeout. The fix is to not click anything new at
// all: after typing the title and pressing Enter (in publishArticle()),
// focus is already inside the next paragraph, so this just keeps typing.
async function typeBody(page, bodyMarkdown, log) {
  const paragraphs = bodyMarkdown.split(/\n{2,}/);
  for (let i = 0; i < paragraphs.length; i++) {
    await typeParagraph(page, paragraphs[i], log);
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
      // Medium auto-converts markdown shortcuts (## , **bold**) asynchronously
      // after each paragraph; too short a pause here can outrun that and land
      // the next paragraph's keystrokes mid-conversion.
      await sleep(500 + Math.random() * 500);
    }
  }
}

export async function publishArticle(page, entry, log) {
  await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded' });

  // Confirmed via inspect-medium.mjs: the title paragraph is the only
  // element on the page carrying this testid.
  const titleField = page.locator('[data-testid="editorTitleParagraph"]').first();
  try {
    await titleField.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    // RECOVERY NOTE: error text reconstructed; the README documents a `not logged in` log line.
    throw new Error(`not logged in (editor did not load at ${page.url()}) — run: node publish-article.mjs --login`);
  }
  await titleField.click();
  await page.keyboard.type(entry.title, { delay: 15 + Math.random() * 25 });
  await page.keyboard.press('Enter');
  await sleep(500 + Math.random() * 500);

  await typeBody(page, entry.body_markdown, log);

  if ((await page.locator('[data-testid="editorParagraphText"]').count()) === 0) {
    throw new Error('body text did not appear after typing — article body may be empty');
  }

  // Medium occasionally shows a dismissible onboarding tip drawer
  // (".js-drawer", e.g. "Select text to change formatting...") after the
  // first selection/formatting action in a session — confirmed live: it
  // caused a real publish run to fail with "element intercepts pointer
  // events" on the Publish button click. It's hidden (display:none) most of
  // the time, so only dismiss it if actually visible.
  const tipDrawerClose = page.locator('button[data-action="toggle-drawer"]').first();
  // .catch(() => false) covers the button not existing in the DOM at all
  // (not just being hidden) — either way, treat it as "nothing to dismiss".
  if (await tipDrawerClose.isVisible().catch(() => false)) {
    await tipDrawerClose.click();
    await sleep(400);
  }

  // Confirmed via a live test run: Medium's top-bar Publish button has no
  // testid, only matchable by its visible text. Clicking it opens a "Story
  // preview" overlay (URL becomes /p/{id}/submission) with a topic picker.
  const publishBtn = page.locator('button:has-text("Publish")').first();
  await publishBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(800 + Math.random() * 1200);
  await publishBtn.click();

  // Confirmed via live test: this can take a few seconds to render, and the
  // tag input's placeholder is exactly "Add a topic..." (with ellipsis).
  const tagInput = page.locator('input[placeholder="Add a topic..."]').first();
  await tagInput.waitFor({ state: 'visible', timeout: 20_000 });
  for (const tag of entry.tags) {
    await tagInput.click();
    await page.keyboard.type(tag, { delay: 20 + Math.random() * 35 });
    await page.keyboard.press('Enter');
    await sleep(300 + Math.random() * 500);
  }

  // Confirmed via live test: once the tag picker is open, the top-bar
  // Publish button is gone (replaced by this overlay) — there is exactly one
  // "Publish" button in the DOM at this point, so no extra scoping is
  // needed. It sits next to a "Schedule for later" button in the same group.
  const confirmBtn = page.locator('button:has-text("Publish")').first();
  await confirmBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await sleep(500 + Math.random() * 800);
  await confirmBtn.click();

  // Confirmed via a live test run: clicking confirm redirects to a
  // transient /p/{id}/submission?redirectUrl=... page, not the public
  // story — that redirect landing is still our success signal (it only
  // happens after a real publish), but we then need the story's own id to
  // build the actual canonical URL.
  await page.waitForURL(/medium\.com\/p\/[a-f0-9]+\/submission/, { timeout: 30_000 });
  const storyId = new URL(page.url()).pathname.match(/\/p\/([a-f0-9]+)\//)?.[1];
  if (!storyId) throw new Error(`could not extract story id from post-publish URL: ${page.url()}`);
  // medium.com/p/{id} 302s to the real canonical https://{user}.medium.com/{id}
  // URL — following it here so what we save is a link a reader can actually
  // open, not an internal submission/edit URL.
  await page.goto(`https://medium.com/p/${storyId}`, { waitUntil: 'domcontentloaded' });
  return page.url();
}

// ---- Run loop (RECOVERY NOTE: rewritten, mirrors post-tweet.mjs; not verified live) --------------------------

// RECOVERY NOTE: rewritten. Looks for the entry's title on the profile's published-stories page. Returns true
// (found), false (page loaded, not found) or 'unknown' (could not check). Text-only match, no selectors.
async function verifyPublished(page, entry) {
  try {
    await page.goto('https://medium.com/me/stories/public', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const text = await page.locator('body').innerText();
    if (/sign in|get started/i.test(text.slice(0, 400)) && !/your stories/i.test(text)) return 'unknown';
    return normalize(text).includes(normalize(entry.title).slice(0, 60));
  } catch {
    return 'unknown';
  }
}

async function openBrowser(log) {
  const { launchBrowser } = await import('./browser.mjs');
  const ctx = await launchBrowser(PROFILE_DIR, log);
  return { page: ctx.pages()[0] ?? (await ctx.newPage()), close: () => ctx.close() };
}

// All side effects are injectable so the state machine is testable without Medium or a browser.
export async function run({
  argv = process.argv.slice(2),
  queueFile = QUEUE_FILE,
  lockFile = LOCK_FILE,
  log = makeLog(path.join(DIR, 'logs', 'publisher.log')),
  now = () => new Date(),
  open = () => openBrowser(log),
  publish = (page, entry) => publishArticle(page, entry, log),
  verify = verifyPublished,
} = {}) {
  if (argv.includes('--login')) return loginMode(log);
  const dryRun = argv.includes('--dry-run');

  if (!acquireLock(lockFile)) {
    log('another publisher/generator run holds the lock, exiting');
    return;
  }
  try {
    const plan = planRun(loadQueue(queueFile), now(), invalidReason);
    let { queue } = plan;
    const { entry, unresolved, skipped } = plan;
    const save = () => saveQueue(queueFile, queue);

    for (const e of skipped) log(`skipped "${e.id}" — ${e.skip_reason}`);
    if (dryRun) {
      log(entry ? `dry run: would publish "${entry.id}" ("${entry.title}"), ${unresolved.length} unresolved attempt(s)` : 'dry run: no articles due');
      return;
    }
    if (skipped.length) save();

    if (!entry && unresolved.length === 0) {
      log('no articles due, nothing to do');
      return;
    }

    const session = await open();
    try {
      // Resolve crashed attempts before publishing anything new.
      let stillUnresolved = 0;
      for (const e of unresolved) {
        const verdict = await verify(session.page, e);
        if (verdict === true) {
          e.published_at = now().toISOString();
          e.recovered = true;
          log(`recovered "${e.id}" — found on the profile, marked published`);
        } else if (verdict === false) {
          delete e.attempt_started_at;
          log(`"${e.id}" not on the profile — re-queued for next run`);
        } else {
          stillUnresolved++;
          log(`could not verify "${e.id}" — left for manual review (check Medium, then edit queue.json)`);
        }
        save();
      }
      if (stillUnresolved > 0) {
        log('not publishing anything new while an attempt is unresolved');
        return;
      }

      if (entry) {
        entry.attempt_started_at = now().toISOString();
        save();
        try {
          const url = await publish(session.page, entry);
          entry.published_at = now().toISOString();
          entry.published_url = url;
          delete entry.attempt_started_at;
          delete entry.last_error;
          save();
          log(`published "${entry.id}" → ${url}`);
        } catch (err) {
          // Clean failure (exception, browser alive): the article did not go out, so clear the marker for a
          // plain retry next run.
          delete entry.attempt_started_at;
          entry.last_error = String(err.message ?? err);
          save();
          throw err;
        }
      }
    } finally {
      await session.close();
    }
  } finally {
    releaseLock(lockFile);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const log = makeLog(path.join(DIR, 'logs', 'publisher.log'));
  run({ log }).catch((err) => {
    log(`ERROR: ${err.message ?? err}`);
    process.exit(1);
  });
}
