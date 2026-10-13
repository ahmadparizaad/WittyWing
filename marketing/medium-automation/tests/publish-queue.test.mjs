import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRun } from '../publish-queue.mjs';

const NOW = new Date('2026-08-02T15:30:00Z');
const entry = (id, over = {}) => ({ id, title: id, scheduled_at: '2026-08-01T00:00:00Z', ...over });
const ok = () => null;

test('picks the oldest due, unpublished entry', () => {
  const q = [entry('b', { scheduled_at: '2026-08-02T00:00:00Z' }), entry('a', { scheduled_at: '2026-07-30T00:00:00Z' })];
  const p = planRun(q, NOW, ok);
  assert.equal(p.entry.id, 'a');
  assert.deepEqual(p.unresolved, []);
});

test('ignores published, in-flight, skipped and future entries', () => {
  const q = [entry('pub', { published_at: 'x' }), entry('fly', { attempt_started_at: 'x' }), entry('skip', { skipped_at: 'x' }),
    entry('future', { scheduled_at: '2026-09-01T00:00:00Z' })];
  const p = planRun(q, NOW, ok);
  assert.equal(p.entry, null);
  assert.deepEqual(p.unresolved.map((e) => e.id), ['fly']);
});

test('skips invalid entries for good, with a reason, and falls through to the next valid one', () => {
  const q = [entry('bad', { scheduled_at: '2026-07-01T00:00:00Z' }), entry('good')];
  const p = planRun(q, NOW, (e) => (e.id === 'bad' ? 'word count 5 outside 1200-1800 range' : null));
  assert.equal(p.entry.id, 'good');
  const bad = p.queue.find((e) => e.id === 'bad');
  assert.equal(bad.skipped_at, NOW.toISOString());
  assert.equal(bad.skip_reason, 'word count 5 outside 1200-1800 range');
  assert.deepEqual(p.skipped.map((e) => e.id), ['bad']);
});

test('does not mutate the queue it was given', () => {
  const q = [entry('bad')];
  const snapshot = JSON.stringify(q);
  planRun(q, NOW, () => 'nope');
  assert.equal(JSON.stringify(q), snapshot);
});

test('returned entry is the same object as the one inside the returned queue', () => {
  const p = planRun([entry('a')], NOW, ok);
  assert.equal(p.queue[0], p.entry);
});
