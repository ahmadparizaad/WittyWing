// Pure queue selection for publish-article.mjs. Never mutates its input.

// Returns { queue, entry, unresolved, skipped }:
//  - entry: the oldest due, unpublished, valid entry (or null). Invalid due entries are skipped for good
//    (skipped_at + skip_reason) so a malformed article can never block the queue.
//  - unresolved: entries whose publish attempt started but never finished (a crash mid-publish).
export function planRun(queue, now, invalidReason) {
  const copy = queue.map((e) => ({ ...e }));
  const unresolved = copy.filter((e) => e.attempt_started_at && !e.published_at);
  const due = copy
    .filter((e) => !e.published_at && !e.attempt_started_at && !e.skipped_at && new Date(e.scheduled_at) <= now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  let entry = null;
  const skipped = [];
  for (const e of due) {
    const reason = invalidReason(e);
    if (reason) {
      e.skipped_at = now.toISOString();
      e.skip_reason = reason;
      skipped.push(e);
    } else {
      entry = e;
      break;
    }
  }
  return { queue: copy, entry, unresolved, skipped };
}
