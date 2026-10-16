import type { Citation } from '@library/contracts';

const CITATION = /\s*\[book:\s*(\d+)\]/g;

export const collectBooks = (value: unknown, into: Map<number, string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectBooks(item, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record['id'] === 'number' && typeof record['title'] === 'string')
    into.set(record['id'], record['title']);
  for (const inner of Object.values(record))
    if (typeof inner === 'object') collectBooks(inner, into);
};

const plain = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"');
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const titleMentions = (
  text: string,
  allowed: ReadonlyMap<number, string>
): Array<{ at: number; bookId: number; title: string }> => {
  const body = plain(text);
  const found: Array<{ at: number; end: number; bookId: number; title: string }> = [];
  for (const [bookId, title] of allowed) {
    const name = plain(title).trim();
    if (name.length < 2) continue;
    const match = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`,
      'iu'
    ).exec(body);
    if (match) found.push({ at: match.index, end: match.index + name.length, bookId, title });
  }
  return found
    .filter(
      f =>
        !found.some(g => g !== f && g.at <= f.at && g.end >= f.end && g.end - g.at > f.end - f.at)
    )
    .sort((x, y) => x.at - y.at)
    .map(({ at, bookId, title }) => ({ at, bookId, title }));
};

export const extractCitations = (
  text: string,
  allowed: ReadonlyMap<number, string>
): { content: string; citations: Citation[] } => {
  const marked: Array<{ at: number; bookId: number }> = [];
  let content = '';
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    content += text.slice(last, match.index);
    marked.push({ at: content.length, bookId: Number(match[1]) });
    last = match.index + match[0].length;
  }
  content += text.slice(last);
  const mentions = [
    ...marked
      .filter(m => allowed.has(m.bookId))
      .map(m => ({ ...m, title: allowed.get(m.bookId)! })),
    ...titleMentions(content, allowed),
  ].sort((x, y) => x.at - y.at);
  const citations: Citation[] = [];
  const seen = new Set<number>();
  for (const { bookId, title } of mentions) {
    if (seen.has(bookId)) continue;
    seen.add(bookId);
    citations.push({ bookId, title });
  }
  return { content: content.trim(), citations };
};
