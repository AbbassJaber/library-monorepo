import type { ReactNode } from 'react';
import { Fragment } from 'react';

const INLINE =
  /(\*\*(?=\S)[^*\n]*?\S\*\*|__(?=\S)[^_\n]*?\S__|\*(?=[^\s*])[^*\n]*?[^\s*]\*|\*[^\s*]\*|(?<![\p{L}\p{N}])_(?=[^\s_])[^_\n]*?[^\s_]_(?![\p{L}\p{N}])|`[^`\n]+`)/u;

const inline = (text: string, key: string): ReactNode[] =>
  text.split(new RegExp(INLINE.source, 'gu')).map((part, i) => {
    const k = `${key}-${i}`;
    if (/^(\*\*|__)/.test(part) && part.length > 4)
      return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (/^`/.test(part) && part.length > 2)
      return (
        <code key={k} className="rounded-[4px] bg-fg/10 px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    if (/^[*_]/.test(part) && part.length > 2 && INLINE.test(part))
      return <em key={k}>{part.slice(1, -1)}</em>;
    return <Fragment key={k}>{part}</Fragment>;
  });

export const formatAnswer = (text: string): ReactNode[] =>
  text.split('\n').flatMap((line, index, lines) => {
    const key = `l${index}`;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const body = heading ? (
      <strong key={key}>{inline(heading[1] ?? '', key)}</strong>
    ) : bullet ? (
      <Fragment key={key}>
        {bullet[1]}
        {'• '}
        {inline(bullet[2] ?? '', key)}
      </Fragment>
    ) : (
      <Fragment key={key}>{inline(line, key)}</Fragment>
    );
    return index < lines.length - 1 ? [body, '\n'] : [body];
  });
