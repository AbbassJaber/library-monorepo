import { BookSort, type NlSearchModelOutput } from '@library/contracts';
import type { GenreDefinition } from '@library/domain-config';

export interface ParsedText {
  q: string | null;
  genres: string[];
  yearFrom: number | null;
  yearTo: number | null;
  sort: BookSort | null;
  confidence: number;
}

const normalise = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[،,;:!?"'“”«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const word = (source: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, 'u');

const SORT_WORDS: Array<[RegExp, BookSort]> = [
  [
    word(
      'best rated|top rated|highest rated|by rating|best|mieux notes?|les mieux notes|الاعلى تقييما|الأعلى تقييما|افضل|أفضل'
    ),
    BookSort.enum.rating,
  ],
  [
    word(
      'newest|latest|recent|most recent|nouveautes?|recents?|les plus recents|الاحدث|الأحدث|جديد'
    ),
    BookSort.enum.newest,
  ],
  [
    word(
      'alphabetical|alphabetically|by title|a to z|par titre|alphabetique|ابجدي|أبجدي|حسب العنوان'
    ),
    BookSort.enum.title,
  ],
];

const DECADE_WORDS: Record<string, number> = {
  twenties: 1920,
  thirties: 1930,
  forties: 1940,
  fifties: 1950,
  sixties: 1960,
  seventies: 1970,
  eighties: 1980,
  nineties: 1990,
  'annees 20': 1920,
  'annees 30': 1930,
  'annees 40': 1940,
  'annees 50': 1950,
  'annees 60': 1960,
  'annees 70': 1970,
  'annees 80': 1980,
  'annees 90': 1990,
  العشرينات: 1920,
  الثلاثينات: 1930,
  الاربعينات: 1940,
  الأربعينات: 1940,
  الخمسينات: 1950,
  الستينات: 1960,
  السبعينات: 1970,
  الثمانينات: 1980,
  التسعينات: 1990,
};

const GENERIC_FORMS = new Set(['novel', 'roman', 'رواية']);

export const parseSearchText = (
  text: string,
  genres: ReadonlyArray<Pick<GenreDefinition, 'slug' | 'aliases'>>
): ParsedText => {
  let rest = ` ${normalise(text)} `;
  let signals = 0;
  const found: string[] = [];
  const generic = new Set<string>();

  const aliases = genres
    .flatMap(genre =>
      [...genre.aliases.en, ...genre.aliases.ar, ...genre.aliases.fr].map(alias => ({
        alias: normalise(alias),
        slug: genre.slug,
      }))
    )
    .filter(entry => entry.alias.length > 0)
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, slug } of aliases) {
    const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const arabic = /\p{Script=Arabic}/u.test(alias);
    const body = arabic
      ? alias
          .split(' ')
          .map(part => `(?:ال)?${escape(part.replace(/ة$/, ''))}(?:ة|ات)?`)
          .join(' ')
      : `${escape(alias)}(?:e?s)?`;
    const pattern = new RegExp(`(^| )${body}(?= |$)`, 'u');
    if (pattern.test(rest) && !found.includes(slug)) {
      found.push(slug);
      if (GENERIC_FORMS.has(alias)) generic.add(slug);
      rest = rest.replace(pattern, ' ');
      signals += 1;
    }
  }
  if (found.length > generic.size) for (const slug of generic) found.splice(found.indexOf(slug), 1);

  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  const setRange = (from: number | null, to: number | null) => {
    yearFrom = from;
    yearTo = to;
    signals += 1;
  };
  const decade = word('(?:from the |in the |des |les |dans les )?(?:(\\d{2})s|(\\d{3}0)s)').exec(
    rest
  );
  if (decade) {
    const base = decade[2]
      ? Number(decade[2])
      : Number(decade[1]) >= 30
        ? 1900 + Number(decade[1])
        : 2000 + Number(decade[1]);
    setRange(base, base + 9);
    rest = rest.replace(decade[0], ' ');
  }
  for (const [word, base] of Object.entries(DECADE_WORDS)) {
    const needle = ` ${normalise(word)} `;
    if (rest.includes(needle)) {
      setRange(base, base + 9);
      rest = rest.split(needle).join(' ');
    }
  }
  const before = word('(?:before|until|up to|avant|قبل)\\s+(\\d{4})').exec(rest);
  if (before) {
    setRange(yearFrom, Number(before[1]) - 1);
    rest = rest.replace(before[0], ' ');
  }
  const after = word('(?:after|since|from|depuis|apres|بعد|منذ)\\s+(\\d{4})').exec(rest);
  if (after) {
    setRange(
      Number(after[1]) +
        (after[0].startsWith('from') || after[0].startsWith('depuis') || after[0].startsWith('منذ')
          ? 0
          : 1),
      yearTo
    );
    rest = rest.replace(after[0], ' ');
  }
  const between = word('(?:between|entre|بين)\\s+(\\d{4})\\s+(?:and|et|و)\\s+(\\d{4})').exec(rest);
  if (between) {
    setRange(Number(between[1]), Number(between[2]));
    rest = rest.replace(between[0], ' ');
  }

  let sort: BookSort | null = null;
  for (const [pattern, value] of SORT_WORDS) {
    const match = pattern.exec(rest);
    if (match) {
      sort = value;
      rest = rest.replace(match[0], ' ');
      signals += 1;
      break;
    }
  }

  const stop = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${'books?|novels?|livres?|romans?|كتب|كتاب|روايات|رواية|about|by|from|the|a|an|of|in|on|sorted|sort|order|ordered|show|me|find|please|des|de|du|la|le|les|un|une|par|sur|et|and|with|that|are|is|which|some|any|حول|عن|من|في|لي|اريد|أريد'})(?![\\p{L}\\p{N}])`,
    'gu'
  );
  const q = rest.replace(stop, ' ').replace(/\s+/g, ' ').trim();
  const confidence = Math.min(1, 0.4 + signals * 0.2 + (q.length > 0 ? 0 : 0.1));
  return {
    q: q.length >= 2 ? q : null,
    genres: found.slice(0, 5),
    yearFrom,
    yearTo,
    sort,
    confidence: Math.round(confidence * 100) / 100,
  };
};

export const toModelOutput = (parsed: ParsedText): NlSearchModelOutput => ({
  q: parsed.q,
  genres: parsed.genres,
  yearFrom: parsed.yearFrom,
  yearTo: parsed.yearTo,
  sort: parsed.sort,
  confidence: parsed.confidence,
});
