// Run with: node --test article.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invalidReason, validateArticle, MIN_WORDS, MAX_WORDS, AI_SLOP_PHRASES } from './article.mjs';

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

function goodArticle(overrides = {}) {
  return {
    title: 'A real title',
    body_markdown: words(1500),
    tags: ['Artificial Intelligence', 'Automation'],
    ...overrides,
  };
}

test('invalidReason accepts a well-formed article', () => {
  assert.equal(invalidReason(goodArticle()), null);
});

test('invalidReason rejects empty title', () => {
  assert.equal(invalidReason(goodArticle({ title: '   ' })), 'empty title');
});

test('invalidReason rejects empty body', () => {
  assert.equal(invalidReason(goodArticle({ body_markdown: '' })), 'empty body');
});

test('invalidReason rejects a body below the tolerance floor', () => {
  const belowFloor = Math.floor(MIN_WORDS * 0.9) - 10;
  const reason = invalidReason(goodArticle({ body_markdown: words(belowFloor) }));
  assert.match(reason, /word count .* outside/);
});

test('invalidReason accepts a body right at the tolerance floor', () => {
  const atFloor = Math.ceil(MIN_WORDS * 0.9) + 1;
  assert.equal(invalidReason(goodArticle({ body_markdown: words(atFloor) })), null);
});

test('invalidReason rejects a body above the tolerance ceiling', () => {
  const aboveCeiling = Math.ceil(MAX_WORDS * 1.1) + 10;
  const reason = invalidReason(goodArticle({ body_markdown: words(aboveCeiling) }));
  assert.match(reason, /word count .* outside/);
});

test('invalidReason rejects an em dash in the title', () => {
  const reason = invalidReason(goodArticle({ title: 'A title — with em dash' }));
  assert.equal(reason, 'contains an em dash or en dash');
});

test('invalidReason rejects an en dash in the body', () => {
  const reason = invalidReason(goodArticle({ body_markdown: `${words(1500)} some–thing` }));
  assert.equal(reason, 'contains an em dash or en dash');
});

test('invalidReason rejects an AI-slop phrase in the title', () => {
  const reason = invalidReason(goodArticle({ title: 'Unlock the power of automation' }));
  assert.match(reason, /AI-slop phrase/);
});

test('invalidReason rejects an AI-slop phrase in the body, case-insensitively', () => {
  const reason = invalidReason(goodArticle({ body_markdown: `${words(1500)} IN CONCLUSION this matters` }));
  assert.match(reason, /AI-slop phrase/);
});

test('invalidReason rejects every phrase in the AI_SLOP_PHRASES list', () => {
  for (const phrase of AI_SLOP_PHRASES) {
    const reason = invalidReason(goodArticle({ body_markdown: `${words(1500)} ${phrase}` }));
    assert.match(reason, /AI-slop phrase/, `expected "${phrase}" to be rejected`);
  }
});

test('invalidReason does not flag a body with none of the slop phrases', () => {
  assert.equal(invalidReason(goodArticle()), null);
});

test('invalidReason rejects missing tags', () => {
  assert.equal(invalidReason(goodArticle({ tags: [] })), 'missing tags');
  assert.equal(invalidReason(goodArticle({ tags: undefined })), 'missing tags');
});

test('validateArticle throws with the same reason invalidReason returns', () => {
  assert.throws(() => validateArticle(goodArticle({ title: '' })), /empty title/);
});

test('validateArticle does not throw for a well-formed article', () => {
  assert.doesNotThrow(() => validateArticle(goodArticle()));
});
