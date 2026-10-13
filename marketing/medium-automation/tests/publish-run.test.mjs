import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../publish-article.mjs';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const goodEntry = (id, over = {}) => ({ id, keyword: 'k' + id, title: 'T ' + id, body_markdown: words(1500), tags: ['AI Agents'], scheduled_at: '2026-08-01T00:00:00Z', ...over });

function env(queue, over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-test-'));
  const queueFile = path.join(dir, 'queue.json');
  const lockFile = path.join(dir, 'logs', '.queue.lock');
  fs.writeFileSync(queueFile, JSON.stringify(queue));
  const calls = { open: 0, close: 0, publish: [], verify: [], logs: [] };
  const read = () => JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  const deps = {
    argv: [], queueFile, lockFile, now: () => new Date('2026-08-02T15:30:00Z'),
    log: (m) => calls.logs.push(m),
    open: async () => { calls.open++; return { page: { id: 'page' }, close: async () => { calls.close++; } }; },
    publish: async (page, entry) => { calls.publish.push({ id: entry.id, snapshot: read().find((e) => e.id === entry.id) }); return 'https://u.medium.com/abc'; },
    verify: async (page, entry) => { calls.verify.push(entry.id); return false; },
    ...over,
  };
  return { deps, calls, read, lockFile };
}

test('nothing due: no browser is opened', async () => {
  const e = env([goodEntry('a', { published_at: 'x' })]);
  await run(e.deps);
  assert.equal(e.calls.open, 0);
});

test('publishes one entry, writing the attempt marker BEFORE publishing and clearing it after', async () => {
  const e = env([goodEntry('a'), goodEntry('b', { scheduled_at: '2026-08-02T00:00:00Z' })]);
  await run(e.deps);
  assert.equal(e.calls.publish.length, 1, 'at most one article per run');
  assert.equal(e.calls.publish[0].id, 'a');
  assert.ok(e.calls.publish[0].snapshot.attempt_started_at, 'marker on disk while publishing');
  const [a, b] = e.read();
  assert.equal(a.published_url, 'https://u.medium.com/abc');
  assert.ok(a.published_at);
  assert.equal(a.attempt_started_at, undefined);
  assert.equal(b.published_at, undefined);
  assert.equal(e.calls.close, 1);
});

test('clean failure: marker cleared, error recorded, error rethrown, browser closed, lock released', async () => {
  const e = env([goodEntry('a')], { publish: async () => { throw new Error('toolbar missing'); } });
  await assert.rejects(run(e.deps), /toolbar missing/);
  const [a] = e.read();
  assert.equal(a.attempt_started_at, undefined);
  assert.equal(a.last_error, 'toolbar missing');
  assert.equal(a.published_at, undefined);
  assert.equal(e.calls.close, 1);
  assert.equal(fs.existsSync(e.lockFile), false);
});

test('crashed attempt found on Medium is marked published and recovered, not re-published', async () => {
  const e = env([goodEntry('a', { attempt_started_at: '2026-08-02T10:00:00Z' })], { verify: async () => true });
  await run(e.deps);
  const [a] = e.read();
  assert.ok(a.published_at);
  assert.equal(a.recovered, true);
  assert.equal(e.calls.publish.length, 0);
});

test('crashed attempt NOT on Medium is re-queued (marker cleared) and published in the same run if it is the oldest due', async () => {
  const e = env([goodEntry('a', { attempt_started_at: '2026-08-02T10:00:00Z' })]);
  await run(e.deps);
  assert.equal(e.calls.publish.length, 0, 'cleared this run, retried next run');
  assert.equal(e.read()[0].attempt_started_at, undefined);
});

test('crashed attempt that cannot be verified is left for manual review and blocks publishing others', async () => {
  const e = env([goodEntry('a', { attempt_started_at: '2026-08-02T10:00:00Z' }), goodEntry('b')], { verify: async () => 'unknown' });
  await run(e.deps);
  assert.equal(e.read()[0].attempt_started_at, '2026-08-02T10:00:00Z');
  assert.equal(e.calls.publish.length, 0);
  assert.ok(e.calls.logs.some((m) => /manual review/.test(m)));
});

test('invalid due entries are skipped with a reason and persisted', async () => {
  const e = env([goodEntry('bad', { body_markdown: 'too short' }), goodEntry('good', { scheduled_at: '2026-08-02T00:00:00Z' })]);
  await run(e.deps);
  const [bad, good] = e.read();
  assert.ok(bad.skipped_at);
  assert.match(bad.skip_reason, /word count/);
  assert.ok(good.published_at);
});

test('--dry-run opens no browser and leaves queue.json untouched', async () => {
  const q = [goodEntry('a'), goodEntry('bad', { body_markdown: 'x' })];
  const e = env(q, { argv: ['--dry-run'] });
  await run(e.deps);
  assert.equal(e.calls.open, 0);
  assert.deepEqual(e.read(), q);
  assert.ok(e.calls.logs.some((m) => /dry run.*"a"/.test(m)));
});

test('another run holding the lock: does nothing', async () => {
  const e = env([goodEntry('a')]);
  fs.mkdirSync(path.dirname(e.lockFile), { recursive: true });
  fs.writeFileSync(e.lockFile, '1');
  await run(e.deps);
  assert.equal(e.calls.open, 0);
  assert.equal(e.read()[0].published_at, undefined);
});
