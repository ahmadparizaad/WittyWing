// Shared article-shape validation for generate-article.mjs and
// publish-article.mjs, so the two never drift out of sync on what counts as
// a publishable article.

export const MIN_WORDS = 1200;
export const MAX_WORDS = 1800;
export const EM_EN_DASH_RE = /[—–]/; // — and –

// Most common AI-slop tells. Not exhaustive (the prompt carries the fuller,
// more nuanced list), but these are cheap, low-false-positive, and worth
// hard-rejecting on regardless of whether the model followed the prompt.
export const AI_SLOP_PHRASES = [
  "in today's fast-paced world",
  'in the ever-evolving landscape',
  "it's important to note that",
  'at the end of the day',
  'unlock the power of',
  'delve into',
  'dive into',
  "let's explore",
  'game-changer',
  'game changer',
  'revolutionize',
  'seamlessly',
  'robust solution',
  'in conclusion',
  'to sum up',
  'final thoughts',
];
const AI_SLOP_RE = new RegExp(AI_SLOP_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

// Returns a skip reason string if the article is not publishable, or null if
// it's fine. Used both to validate freshly-generated articles (throw on
// failure, retry) and as a defense-in-depth check before publishing any
// queue entry (skip on failure, don't crash the run).
export function invalidReason(article) {
  if (!article.title?.trim()) return 'empty title';
  if (!article.body_markdown?.trim()) return 'empty body';
  const wordCount = article.body_markdown.trim().split(/\s+/).length;
  if (wordCount < MIN_WORDS * 0.9 || wordCount > MAX_WORDS * 1.1) {
    return `word count ${wordCount} outside ${MIN_WORDS}-${MAX_WORDS} range`;
  }
  if (EM_EN_DASH_RE.test(article.title) || EM_EN_DASH_RE.test(article.body_markdown)) {
    return 'contains an em dash or en dash';
  }
  const slopMatch = article.title.match(AI_SLOP_RE) ?? article.body_markdown.match(AI_SLOP_RE);
  if (slopMatch) return `contains AI-slop phrase: "${slopMatch[0]}"`;
  if (!Array.isArray(article.tags) || article.tags.length === 0) return 'missing tags';
  return null;
}

export function validateArticle(article) {
  const reason = invalidReason(article);
  if (reason) throw new Error(reason);
}
