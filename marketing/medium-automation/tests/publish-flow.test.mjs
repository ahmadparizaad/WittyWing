// Scripted fake Playwright page: verifies the ORDER of editor steps and the URL logic, not live Medium selectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishArticle } from '../publish-article.mjs';

function fakePage({ titleVisible = true, paragraphCount = 3 } = {}) {
  const events = [];
  let url = 'https://medium.com/new-story';
  const locator = (sel) => ({
    first: () => locator(sel),
    waitFor: async () => { if (sel.includes('editorTitleParagraph') && !titleVisible) throw new Error('timeout'); events.push(`wait ${sel}`); },
    click: async () => { events.push(`click ${sel}`); if (sel.includes('has-text("Publish")')) url = 'https://medium.com/p/abc123/submission?redirectUrl=x'; },
    isVisible: async () => false,
    count: async () => (sel.includes('editorParagraphText') ? paragraphCount : 0),
  });
  return {
    events,
    url: () => url,
    goto: async (u) => { events.push(`goto ${u}`); url = u === 'https://medium.com/p/abc123' ? 'https://user.medium.com/abc123' : u; },
    locator,
    waitForURL: async (re) => { assert.match(url, re); events.push('waitForURL submission'); },
    keyboard: { type: async (t) => { events.push(`type ${t}`); }, press: async (k) => { events.push(`press ${k}`); }, down: async () => {}, up: async () => {} },
    evaluate: async () => ({ ok: true }),
  };
}

const entry = { title: 'My Title', body_markdown: 'First para.\n\nSecond para.', tags: ['AI Agents', 'Automation'] };

test('types title, Enter, body, then publishes with tags and returns the canonical URL', async () => {
  const page = fakePage();
  const url = await publishArticle(page, entry, () => {});
  assert.equal(url, 'https://user.medium.com/abc123');
  const e = page.events;
  const idx = (s) => e.findIndex((x) => x === s);
  assert.ok(idx('goto https://medium.com/new-story') < idx('type My Title'));
  assert.ok(idx('type My Title') < idx('press Enter'));
  assert.ok(idx('press Enter') < idx('type First para.'));
  assert.ok(idx('type First para.') < idx('type Second para.'));
  assert.ok(idx('type Second para.') < idx('type AI Agents'));
  assert.ok(idx('type AI Agents') < idx('type Automation'));
  assert.ok(idx('type Automation') < idx('waitForURL submission'));
  assert.ok(idx('waitForURL submission') < idx('goto https://medium.com/p/abc123'));
  assert.equal(e.filter((x) => x.startsWith('click button:has-text("Publish")')).length, 2, 'top-bar Publish, then confirm Publish');
});

test('throws a "not logged in" error when the editor never appears', async () => {
  await assert.rejects(publishArticle(fakePage({ titleVisible: false }), entry, () => {}), /not logged in/);
});

test('throws if no body paragraph exists after typing', async () => {
  await assert.rejects(publishArticle(fakePage({ paragraphCount: 0 }), entry, () => {}), /body text did not appear/);
});
