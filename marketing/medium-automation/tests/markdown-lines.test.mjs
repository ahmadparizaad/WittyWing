import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripInlineCode, parseHeading, parseFirstBoldSegment } from '../markdown-lines.mjs';

test('stripInlineCode keeps the inner text, drops the backticks', () => {
  assert.equal(stripInlineCode('use `npm i` then `node x`'), 'use npm i then node x');
  assert.equal(stripInlineCode('no code here'), 'no code here');
});

test('parseHeading handles ## and ###, strips inner bold, returns null for non-headings', () => {
  assert.equal(parseHeading('## Why it fails'), 'Why it fails');
  assert.equal(parseHeading('### The **real** cause'), 'The real cause');
  assert.equal(parseHeading('plain paragraph'), null);
  assert.equal(parseHeading('# H1 is not supported'), null);
});

test('parseFirstBoldSegment returns offsets of the first bold span in the plain text', () => {
  const r = parseFirstBoldSegment('Start **bold bit** end');
  assert.equal(r.plainText, 'Start bold bit end');
  assert.deepEqual(r.boldRange, { start: 6, end: 14 });
  assert.equal(r.plainText.slice(r.boldRange.start, r.boldRange.end), 'bold bit');
  assert.equal(r.droppedCount, 0);
});

test('parseFirstBoldSegment drops later bold spans to plain text and reports them', () => {
  const r = parseFirstBoldSegment('**a** and **b** and **c**');
  assert.equal(r.plainText, 'a and b and c');
  assert.deepEqual(r.boldRange, { start: 0, end: 1 });
  assert.equal(r.droppedCount, 2);
});

test('parseFirstBoldSegment with no bold leaves the line alone', () => {
  assert.deepEqual(parseFirstBoldSegment('nothing'), { plainText: 'nothing', boldRange: null, droppedCount: 0 });
});
