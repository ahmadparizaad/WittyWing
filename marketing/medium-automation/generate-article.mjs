#!/usr/bin/env node
// Generates the next Medium article headlessly via the Claude CLI (`claude -p`),
// using the OpenSEO MCP (already added: `claude mcp add --transport http
// --scope user openseo https://app.openseo.so/mcp`) to pick an underrated
// keyword in the AI agents / automation niche, then writing a full article
// for it. Intended to run weekly, right before publish-article.mjs.
//
// Usage: node generate-article.mjs [--dry-run]
//
// IMPORTANT (NDA boundary): this script's prompt is seeded ONLY with OpenSEO
// keyword research and the last few queued article titles/keywords — it has
// no access to any project's source code or build activity. Do not add
// filesystem scanning of ~/Projects or similar without an explicit,
// user-maintained allowlist file naming only personal (non-company) repos.
//
// The OpenSEO MCP server is OAuth-protected — only the `claude` CLI (already
// authorized via `claude mcp add`) can call it. This script therefore does
// NOT call OpenSEO directly; it asks Claude to use its own openseo MCP tools
// as part of a single `-p` invocation.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, makeLog, loadQueue, saveQueue, acquireLock, releaseLock } from './lib.mjs';
import { MIN_WORDS, MAX_WORDS, validateArticle } from './article.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_FILE = path.join(DIR, 'queue.json');
const LOCK_FILE = path.join(DIR, 'logs', '.queue.lock');
const LOG_FILE = path.join(DIR, 'logs', 'generator.log');
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? path.join(os.homedir(), '.local', 'bin', 'claude');

const log = makeLog(LOG_FILE);

function buildPrompt(recentEntries) {
  const recentList = recentEntries.length
    ? recentEntries.map((e) => `  - "${e.title}" (keyword: ${e.keyword})`).join('\n')
    : '  (none yet)';

  return `You are writing one Medium article for a builder who ships AI agents and automation tooling (Chrome extensions, browser-session automation, Claude-CLI-driven pipelines). This is organic growth content, not company/client work — it must stand alone as personal, human writing.

Step 1 — Keyword research: use your OpenSEO MCP tools to find keyword opportunities in the "AI agents and automation" niche. Look for underrated keywords: real search-intent signal, but low content saturation — not the obvious head terms everyone already covers. Shortlist 3-5 candidates, then pick the single best one by that criterion.

Step 2 — Write the article for the chosen keyword:
- length: ${MIN_WORDS}-${MAX_WORDS} words
- voice: human-sounding, first person, builder-to-builder, concrete and specific over generic

STRICT RULES (non-negotiable, verify your own output against every one of these before returning it):
1. NO em dashes (—) or en dashes (–) anywhere, in the title or body. Use a comma, period, semicolon, or parentheses instead. Scan your draft for these two characters specifically and remove any you find.
2. NO AI-slop phrasing. Do not write: "in today's fast-paced world", "in the ever-evolving landscape of", "it's important to note that", "at the end of the day", "unlock the power of", "delve into", "dive into", "let's explore", "game-changer", "game changer", "revolutionize", "seamless(ly)", "leverage" (as a verb), "robust solution", "in conclusion", "to sum up", "moreover", "furthermore", "additionally" (as a paragraph opener), or any sentence that restates the previous sentence in fancier words.
3. NO listicle padding or filler transitions. Every sentence must say something specific and load-bearing; if a sentence could be deleted without losing information, delete it.
4. NO generic AI-essay structure: don't open with a dictionary-style definition of the keyword, don't end with a "conclusion" or "final thoughts" recap paragraph that just repeats the article, don't use exactly three examples/tips/reasons just because three is a common pattern.
5. Be specific: use real numbers, real tradeoffs, real failure modes, concrete tool/technique names — not vague abstractions like "various tools" or "many developers".
- structure: a real title (not clickbait), an opening that gets to the point fast, a few concrete sections with subheadings, and a natural ending that just stops when the point is made
- do not reference or describe any company or client project. Only draw on general, publicly-shareable knowledge of building AI agents/automation tooling.
- do not repeat ideas from these already-queued articles:
${recentList}

Output ONLY a single JSON object, no markdown fences, no commentary, in exactly this shape:
{"keyword": "...", "title": "...", "body_markdown": "...", "tags": ["...", "..."]}

"tags" must be 3-5 short Medium-style topic tags (e.g. "Artificial Intelligence", "Automation", "AI Agents"). "body_markdown" must use standard markdown (## for subheadings, **bold**, etc).`;
}

// Claude's -p output for a long body_markdown field reliably contains raw
// literal control characters (mainly newlines between paragraphs) inside the
// JSON string value instead of escaped \n — telling it not to do this in the
// prompt isn't reliable at this length, so this walks the JSON text
// char-by-char and escapes every C0 control character (0x00-0x1F) whenever
// it appears inside a string literal, leaving the JSON structure itself
// (braces, commas, whitespace between tokens) untouched. This changes only
// how a character is *encoded* in the JSON source, not the decoded string
// value: a raw newline and an escaped \n decode to the identical character,
// so this cannot alter article content, only make already-intended content
// parseable. Throws if a string literal is never closed (truncated output)
// rather than silently returning something that would fail JSON.parse with
// a more confusing error.
function escapeControlCharsInStrings(json) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else if (ch.charCodeAt(0) < 0x20) {
        out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      } else {
        out += ch;
      }
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  if (inString) throw new Error('JSON string literal never closed — claude output looks truncated');
  return out;
}

function parseArticle(raw) {
  const cleaned = raw.replace(/```(json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON object in claude output: ${cleaned.slice(0, 200)}`);
  const candidate = cleaned.slice(start, end + 1);
  // Always sanitize before parsing (not just on failure): this keeps
  // behavior identical regardless of whether Claude happened to escape its
  // newlines correctly, rather than having two different code paths that
  // could in principle disagree on the same input.
  const obj = JSON.parse(escapeControlCharsInStrings(candidate));
  for (const field of ['keyword', 'title', 'body_markdown', 'tags']) {
    if (!(field in obj)) throw new Error(`claude output missing "${field}"`);
  }
  if (!Array.isArray(obj.tags) || obj.tags.length === 0) throw new Error('claude output "tags" must be a non-empty array');
  return obj;
}

function runClaude(prompt) {
  // Headless -p mode has no one to answer an interactive tool-permission
  // prompt, so it silently refuses tool calls unless explicitly allowed.
  // Scoped to just the OpenSEO MCP tools this script actually needs — no
  // shell/file access, matching the NDA/filesystem-isolation guarantee
  // documented above.
  const res = spawnSync(CLAUDE_BIN, ['-p', prompt, '--allowedTools', 'mcp__openseo'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 8 * 60_000,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`claude exited ${res.status}: ${res.stderr?.slice(0, 500)}`);
  return res.stdout;
}

// RECOVERY NOTE: everything below this line was rewritten, not recovered. The original tail of this file
// (retry loop, duplicate check, queue append, main) was lost with the transcripts; the behaviour here is
// reconstructed from the README ("appends the result to queue.json", "last 8 queued articles"), from
// publish-article.mjs (oldest due, unpublished entry) and from lib.mjs (shared lock).
const MAX_ATTEMPTS = 3;
const RECENT_COUNT = 8;

function duplicateReason(article, queue) {
  const title = normalize(article.title);
  const keyword = normalize(article.keyword);
  for (const e of queue) {
    if (normalize(e.title ?? '') === title) return `duplicate title: "${article.title}"`;
    if (normalize(e.keyword ?? '') === keyword) return `duplicate keyword: "${article.keyword}"`;
  }
  return null;
}

// Generates until one article passes parsing, validation and the duplicate check.
function generateArticle(queue) {
  const prompt = buildPrompt(queue.slice(-RECENT_COUNT));
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const article = parseArticle(runClaude(prompt));
      validateArticle(article);
      const dup = duplicateReason(article, queue);
      if (dup) throw new Error(dup);
      return article;
    } catch (err) {
      lastErr = err;
      log(`attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
    }
  }
  throw new Error(`gave up after ${MAX_ATTEMPTS} attempts: ${lastErr.message}`);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Due immediately: the publisher takes the oldest due, unpublished entry.
function toEntry(article, now = new Date()) {
  return {
    id: `${now.toISOString().slice(0, 10)}-${slug(article.keyword)}`,
    keyword: article.keyword,
    title: article.title,
    body_markdown: article.body_markdown,
    tags: article.tags,
    scheduled_at: now.toISOString(),
    source: 'openseo-claude',
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!acquireLock(LOCK_FILE)) {
    log('another run holds the queue lock, exiting');
    return 0;
  }
  try {
    const queue = loadQueue(QUEUE_FILE);
    const article = generateArticle(queue);
    if (dryRun) {
      log(`dry run: "${article.title}" (keyword: ${article.keyword}) NOT queued`);
      return 0;
    }
    saveQueue(QUEUE_FILE, [...queue, toEntry(article)]);
    log(`queued "${article.title}" (keyword: ${article.keyword})`);
    return 0;
  } catch (err) {
    log(`FAILED: ${err.message}`);
    return 1;
  } finally {
    releaseLock(LOCK_FILE);
  }
}

process.exitCode = main();
