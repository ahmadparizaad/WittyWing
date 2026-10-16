// Pure markdown-line helpers for typing an article into Medium's editor (recovered from publish-article.mjs).

// Strips `code` backtick markers, keeping the inner text. Medium silently
// eats backtick characters as you type them (confirmed live: typing a
// `code span` results in DOM text "code span" with the backticks gone and
// no code styling applied — there's no working inline-code mechanism to
// hook into, so this treats backticks the same as a markdown feature
// Medium doesn't support at all: strip the markers, keep the text plain,
// same safe-degradation approach as extra ** bold spans). Must run BEFORE
// any offset math so character positions match what Medium will actually
// contain after typing.
export function stripInlineCode(line) {
  return line.replace(/`([^`]+)`/g, '$1');
}

// Strips ## /### markers from a heading line, returning the plain text.
// Also strips any ** bold markers within it (headings are always formatted
// as a whole via the h3 toolbar action, so an inner **bold** span would
// otherwise show as literal asterisks with no way to format just part of a
// heading's text through the same select-and-click mechanism). Assumes
// inline-code backticks were already stripped by the caller.
export function parseHeading(line) {
  const text = line.match(/^#{2,3}\s+(.*)/)?.[1];
  return text != null ? text.replace(/\*\*(.+?)\*\*/g, '$1') : null;
}

// Finds the first **bold** span in a line. Returns the line with all **
// markers removed (first span's text kept in place for later selection,
// any further spans left as plain unformatted text) plus the character
// offsets of the first span within that plain text, or null if there's no
// bold span at all. Also reports how many additional bold spans (if any)
// got their markers stripped without being formatted, so the caller can log
// it — this is a deliberate, visible quality tradeoff, not a silent one.
export function parseFirstBoldSegment(line) {
  const re = /\*\*(.+?)\*\*/g;
  const first = re.exec(line);
  if (!first) return { plainText: line, boldRange: null, droppedCount: 0 };
  const before = line.slice(0, first.index);
  const boldText = first[1];
  const afterRaw = line.slice(re.lastIndex);
  const droppedCount = (afterRaw.match(/\*\*(.+?)\*\*/g) ?? []).length;
  const after = afterRaw.replace(/\*\*(.+?)\*\*/g, '$1');
  return {
    plainText: before + boldText + after,
    boldRange: { start: before.length, end: before.length + boldText.length },
    droppedCount,
  };
}
