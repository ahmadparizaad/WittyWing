// Run with: node --test tests/
// Runs generate-article.mjs in a temp copy of this folder with a stub `claude` binary (never the real one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const words = (n, tag = 'w') => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const article = (o = {}) => ({ keyword: 'agent retries', title: 'Retries that work', body_markdown: words(1500), tags: ['AI Agents', 'Automation'], ...o });

function sandbox(outputs, queue = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-test-'));
  for (const f of ['generate-article.mjs', 'lib.mjs', 'article.mjs']) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue));
  const outDir = path.join(dir, 'stub');
  fs.mkdirSync(outDir);
  outputs.forEach((o, i) => fs.writeFileSync(path.join(outDir, `${i}.txt`), typeof o === 'string' ? o : JSON.stringify(o)));
  const bin = path.join(dir, 'fake-claude.mjs');
  fs.writeFileSync(bin, `#!/usr/bin/env node
import fs from 'node:fs';
const d = ${JSON.stringify(outDir)}; const c = d + '/count';
const n = fs.existsSync(c) ? Number(fs.readFileSync(c, 'utf8')) : 0; fs.writeFileSync(c, String(n + 1));
const f = d + '/' + Math.min(n, fs.readdirSync(d).filter((x) => x.endsWith('.txt')).length - 1) + '.txt';
process.stdout.write(fs.readFileSync(f, 'utf8'));
`, { mode: 0o755 });
  const run = (...args) => spawnSync('node', [path.join(dir, 'generate-article.mjs'), ...args], { env: { ...process.env, CLAUDE_BIN: bin }, encoding: 'utf8' });
  const queueNow = () => JSON.parse(fs.readFileSync(path.join(dir, 'queue.json'), 'utf8'));
  const calls = () => Number(fs.existsSync(path.join(outDir, 'count')) ? fs.readFileSync(path.join(outDir, 'count'), 'utf8') : 0);
  return { dir, run, queueNow, calls };
}

test('queues a valid article as an immediately-due entry', () => {
  const s = sandbox([article()]);
  const r = s.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const [e] = s.queueNow();
  assert.equal(s.queueNow().length, 1);
  assert.equal(e.title, 'Retries that work');
  assert.equal(e.keyword, 'agent retries');
  assert.deepEqual(e.tags, ['AI Agents', 'Automation']);
  assert.match(e.id, /^\d{4}-\d{2}-\d{2}-agent-retries$/);
  assert.ok(new Date(e.scheduled_at) <= new Date(), 'due now');
  assert.equal(e.published_at, undefined);
});

test('--dry-run never touches queue.json', () => {
  const s = sandbox([article()]);
  const r = s.run('--dry-run');
  assert.equal(r.status, 0);
  assert.deepEqual(s.queueNow(), []);
  assert.match(r.stdout, /dry run/);
});

test('tolerates raw newlines inside the JSON string and code fences', () => {
  const raw = '```json\n{"keyword": "k one", "title": "T one", "body_markdown": "' + words(1500).replace(/ w100 /, ' w100\n\n') + '", "tags": ["A"]}\n```';
  const s = sandbox([raw]);
  assert.equal(s.run().status, 0);
  assert.equal(s.queueNow().length, 1);
});

test('retries after an invalid article and accepts the next one', () => {
  const s = sandbox([article({ body_markdown: words(50) }), article({ title: 'Second try' })]);
  const r = s.run();
  assert.equal(r.status, 0, r.stdout);
  assert.equal(s.calls(), 2);
  assert.equal(s.queueNow()[0].title, 'Second try');
});

test('rejects a duplicate title or keyword already in the queue, then gives up after 3 attempts', () => {
  const prior = [{ id: 'x', title: 'Retries   that WORK', keyword: 'other', body_markdown: 'b', tags: ['A'], scheduled_at: '2026-01-01T00:00:00Z' }];
  const s = sandbox([article()], prior);
  const r = s.run();
  assert.equal(r.status, 1);
  assert.equal(s.calls(), 3);
  assert.equal(s.queueNow().length, 1, 'queue unchanged');
  assert.match(r.stdout, /duplicate/);
});

test('exits non-zero without writing when claude output is garbage', () => {
  const s = sandbox(['sorry, I cannot do that']);
  assert.equal(s.run().status, 1);
  assert.deepEqual(s.queueNow(), []);
});

test('does nothing (exit 0) while another run holds a fresh queue lock', () => {
  const s = sandbox([article()]);
  fs.mkdirSync(path.join(s.dir, 'logs'));
  fs.writeFileSync(path.join(s.dir, 'logs', '.queue.lock'), '1');
  const r = s.run();
  assert.equal(r.status, 0);
  assert.equal(s.calls(), 0);
  assert.deepEqual(s.queueNow(), []);
});

test('releases the lock after a run', () => {
  const s = sandbox([article()]);
  s.run();
  assert.equal(fs.existsSync(path.join(s.dir, 'logs', '.queue.lock')), false);
});
