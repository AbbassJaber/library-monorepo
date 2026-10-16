import {
  AutofillModelOutput,
  GENRES_PER_BOOK_MAX,
  PUBLISHED_YEAR_MIN,
  SYNOPSIS_MAX_LENGTH,
  publishedYearMax,
  FieldSource,
  AiFeature,
} from '@library/contracts';
import type { AiMeta, AutofillBody, BookDraft, Genre } from '@library/contracts';
import { domain } from '@library/domain-config';
import type { ExternalRecord } from '@library/domain-config';
import { BUDGETS, TRUNCATION } from '../cost/budgets.js';
import type { Actor, LookupPort, Ports } from '../ports/index.js';
import { GENRE_GUIDE } from '../prompts/genreGuide.js';
import { composeSystem } from '../prompts/ordering.js';
import type { MockToolHandler } from '../providers/mock/index.js';
import { z } from 'zod';
import { parseSearchText } from '../providers/mock/parser.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { GenerateRequest, LlmProvider } from '../providers/types.js';
import { onlyAllowed } from '../safety/allowlist.js';
import { generateValidated } from '../safety/generateValidated.js';
import { clip, dataBlock } from '../safety/untrusted.js';
import { inputJsonSchema } from '../tools/registry.js';
import { runFeature } from './run.js';

export const AUTOFILL_TOOL = 'draft_book';

const LOOKUP_CONFIDENCE = { isbn: 0.95, title: 0.8 } as const;
const SUBJECTS_IN_PROMPT = 20;

const MODEL_FIELDS = ['author', 'publishedYear', 'synopsis', 'genres'] as const;
type ModelField = (typeof MODEL_FIELDS)[number];
type AskedField = ModelField | 'yearCheck';
export const YEAR_CHECK_MIN_CONFIDENCE = 0.5;

const INSTRUCTIONS = `You help a librarian catalogue a book. The external catalog record (when one was found) and the librarian's request are given as data.
Fill the fields named in the "missing" block (the only ones the ${AUTOFILL_TOOL} tool asks for), by calling the tool once.
Rules:
- genres: 1 to 3 slugs from the genre list that best describe this book, judged from the record's subjects and what you know of the book. Never a slug outside the list; an empty list when you cannot tell.
- author and publishedYear: only when you know this exact book. publishedYear is the year of first publication in the original language, never an edition or translation year. Otherwise null.
- synopsis: 2 to 4 sentences in English, neutral catalog tone, no spoiler of the ending, in your own words. null when you do not know the book.
- yearCheck (asked only when the record has a year): the year this book was first published in its original language, from your own knowledge, whatever the record says; null when you do not know.
- confidence: 0 to 1 per field, how sure you are; 0 for a null field.
- When the record does not seem to be the requested book, fill nothing and give low confidence rather than guessing.`;

type Field<T> = { value: T | null; source: FieldSource; confidence: number };

const empty = <T>(): Field<T> => ({ value: null, source: FieldSource.enum.empty, confidence: 0 });
const filled = <T>(
  value: T | null | undefined,
  source: FieldSource,
  confidence: number
): Field<T> =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
    ? empty()
    : { value, source, confidence };
const firstOf = <T>(...fields: Field<T>[]): Field<T> =>
  fields.find(field => field.source !== FieldSource.enum.empty) ?? empty();

const validYear = (value: number | null | undefined): number | null =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= PUBLISHED_YEAR_MIN &&
  value <= publishedYearMax()
    ? value
    : null;
const validIsbn = (value: string | null | undefined): string | null =>
  value && /^(?:\d{9}[\dX]|\d{13})$/.test(value) ? value : null;
const validUrl = (value: string | null | undefined): string | null =>
  value && /^https?:\/\//.test(value) ? value : null;

export interface LookupResult {
  record: ExternalRecord | null;
  by: 'isbn' | 'title' | null;
}

export const lookupRecord = async (
  lookup: LookupPort,
  input: AutofillBody
): Promise<LookupResult> => {
  const quietly = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise;
    } catch {
      return fallback;
    }
  };
  if (input.isbn !== undefined) {
    const record = await quietly(lookup.byIsbn(input.isbn), null);
    if (record) return { record, by: 'isbn' };
  }
  if (input.title !== undefined) {
    const [record] = await quietly(lookup.byTitle(input.title, input.author), []);
    if (record) return { record, by: 'title' };
  }
  return { record: null, by: null };
};

export const lookupDraft = (input: AutofillBody, found: LookupResult): BookDraft => {
  const { record } = found;
  const confidence = found.by === null ? 0 : LOOKUP_CONFIDENCE[found.by];
  const synopsis = record?.description ? clip(record.description, SYNOPSIS_MAX_LENGTH) : null;
  return {
    title: firstOf(
      filled(record?.title, FieldSource.enum.lookup, confidence),
      filled(input.title, FieldSource.enum.input, 1)
    ),
    author: firstOf(
      filled(record?.authors[0], FieldSource.enum.lookup, confidence),
      filled(input.author, FieldSource.enum.input, 1)
    ),
    publishedYear: {
      ...filled(validYear(record?.year), FieldSource.enum.lookup, confidence),
      conflict: null,
    },
    synopsis: filled(synopsis, FieldSource.enum.lookup, confidence),
    isbn: firstOf(
      filled(validIsbn(record?.isbn), FieldSource.enum.lookup, confidence),
      filled(input.isbn, FieldSource.enum.input, 1)
    ),
    coverUrl: filled(validUrl(record?.coverUrl), FieldSource.enum.lookup, confidence),
    genreIds: empty(),
    lookupSource: record?.source ?? null,
  };
};

const missingFields = (draft: BookDraft): ModelField[] =>
  MODEL_FIELDS.filter(field =>
    field === 'genres'
      ? draft.genreIds.source === FieldSource.enum.empty
      : draft[field].source === FieldSource.enum.empty
  );

const askedFields = (draft: BookDraft): AskedField[] => [
  ...missingFields(draft),
  ...(draft.publishedYear.source === FieldSource.enum.empty ? [] : (['yearCheck'] as const)),
];

export type AutofillAnswer = Partial<Omit<AutofillModelOutput, 'confidence'>> & {
  confidence: Partial<AutofillModelOutput['confidence']>;
};

const SCHEMA_ORDER = ['genres', 'author', 'publishedYear', 'yearCheck', 'synopsis'] as const;

export const schemaFor = (asked: readonly AskedField[]): z.ZodType<AutofillAnswer> => {
  const fields = SCHEMA_ORDER.filter(field => asked.includes(field));
  const full = AutofillModelOutput.shape;
  const confidence = full.confidence.shape;
  return z.strictObject({
    ...Object.fromEntries(fields.map(field => [field, full[field]])),
    confidence: z.strictObject(Object.fromEntries(fields.map(field => [field, confidence[field]]))),
  }) as unknown as z.ZodType<AutofillAnswer>;
};

export const onlyAsked = (
  request: GenerateRequest,
  output: AutofillModelOutput
): AutofillAnswer => {
  const schema = request.tools?.[0]?.inputSchema as
    { properties?: Record<string, unknown> } | undefined;
  const keys = Object.keys(schema?.properties ?? {}).filter(key => key !== 'confidence');
  const pick = (source: object) =>
    Object.fromEntries(Object.entries(source).filter(([key]) => keys.includes(key)));
  return { ...pick(output), confidence: pick(output.confidence) } as AutofillAnswer;
};

const yearConflict = (
  current: BookDraft['publishedYear'],
  output: AutofillAnswer
): BookDraft['publishedYear']['conflict'] => {
  const year = validYear(output.yearCheck);
  const confidence = output.confidence.yearCheck ?? 0;
  return current.source === FieldSource.enum.lookup &&
    year !== null &&
    year !== current.value &&
    confidence >= YEAR_CHECK_MIN_CONFIDENCE
    ? { value: year, confidence }
    : null;
};

export const mergeModelOutput = (
  draft: BookDraft,
  output: AutofillAnswer,
  genres: Genre[]
): BookDraft => {
  const gap = <T>(current: Field<T>, value: T | null, confidence: number): Field<T> =>
    current.source === FieldSource.enum.empty
      ? filled(value, FieldSource.enum.model, confidence)
      : current;
  const { kept } = onlyAllowed(
    [...new Set(output.genres ?? [])],
    genres.map(genre => genre.slug)
  );
  const genreIds = kept
    .slice(0, GENRES_PER_BOOK_MAX)
    .map(slug => genres.find(genre => genre.slug === slug)!.id);
  return {
    ...draft,
    author: gap(draft.author, output.author ?? null, output.confidence.author ?? 0),
    publishedYear: {
      ...gap(
        draft.publishedYear,
        validYear(output.publishedYear),
        output.confidence.publishedYear ?? 0
      ),
      conflict: yearConflict(draft.publishedYear, output),
    },
    synopsis: gap(draft.synopsis, output.synopsis ?? null, output.confidence.synopsis ?? 0),
    genreIds: gap(
      draft.genreIds,
      genreIds.length > 0 ? genreIds : null,
      output.confidence.genres ?? 0
    ),
  };
};

const recordForPrompt = (record: ExternalRecord | null) =>
  record === null
    ? null
    : {
        title: record.title,
        authors: record.authors,
        firstPublished: record.year,
        isbn: record.isbn,
        subjects: record.subjects.slice(0, SUBJECTS_IN_PROMPT),
        description: record.description ? clip(record.description, TRUNCATION.synopsisChars) : null,
      };

export interface AutofillDeps {
  llm: LlmProvider;
  ports: Ports;
}

export interface AutofillOutcome {
  value: BookDraft;
  meta: AiMeta | null;
  lookupHit: boolean;
  aiUnavailable: boolean;
  unavailableReason: string | null;
}

export const autofill = async (
  deps: AutofillDeps,
  ctx: { actor: Actor; requestId: string | null },
  input: AutofillBody
): Promise<AutofillOutcome> => {
  const found = await lookupRecord(deps.ports.lookup, input);
  const draft = lookupDraft(input, found);
  const lookupHit = found.record !== null;
  if (!lookupHit && input.title === undefined)
    return { value: draft, meta: null, lookupHit, aiUnavailable: false, unavailableReason: null };

  const genres = await deps.ports.catalog.listGenres(ctx.actor);
  const asked = askedFields(draft);
  const budget = BUDGETS.AUTOFILL;
  const system = composeSystem({
    instructions: `${INSTRUCTIONS}\n\n${GENRE_GUIDE}`,
    vocabulary: domain.prompts.vocabulary,
    examples: `Genre list:\n${dataBlock(
      'genres',
      genres.map(genre => ({ slug: genre.slug, name: genre.name }))
    )}`,
    dataBlocks: [
      dataBlock('record', recordForPrompt(found.record)),
      dataBlock('missing', missingFields(draft)),
    ],
  });
  const request = {
    isbn: input.isbn ?? null,
    title: input.title ?? null,
    author: input.author ?? null,
  };
  try {
    const outcome = await runFeature(
      {
        feature: AiFeature.enum.AUTOFILL,
        llm: deps.llm,
        trace: deps.ports.trace,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      async signal => {
        const result = await generateValidated(
          deps.llm,
          {
            tier: budget.tier,
            system,
            messages: [
              {
                role: 'user',
                content: `Draft the missing fields for this book.\n${dataBlock('request', request)}`,
              },
            ],
            maxOutputTokens: budget.maxOutputTokens,
            signal,
          },
          {
            name: AUTOFILL_TOOL,
            description: 'The missing fields of the book draft.',
            schema: schemaFor(asked),
          },
          inputJsonSchema
        );
        return result.ok
          ? {
              value: mergeModelOutput(draft, result.value, genres),
              attempts: result.attempts,
              fallbackUsed: false,
            }
          : { value: draft, attempts: result.attempts, fallbackUsed: true };
      }
    );
    return {
      value: outcome.value,
      meta: outcome.meta,
      lookupHit,
      aiUnavailable: false,
      unavailableReason: null,
    };
  } catch (error) {
    if (error instanceof ProviderUnavailableError)
      return {
        value: draft,
        meta: null,
        lookupHit,
        aiUnavailable: true,
        unavailableReason: error.message,
      };
    throw error;
  }
};

const dataFrom = (request: GenerateRequest, name: string): unknown => {
  const text = request.system.map(block => block.text).join('\n');
  const match = new RegExp(`<data name="${name}">\\n([\\s\\S]*?)\\n</data>`).exec(text);
  return match?.[1] === undefined ? null : (JSON.parse(match[1]) as unknown);
};

export const autofillMockHandler: MockToolHandler = request => {
  const record = dataFrom(request, 'record') as { subjects?: string[] } | null;
  const genres = parseSearchText((record?.subjects ?? []).join(' ; '), domain.genres).genres.slice(
    0,
    3
  );
  return onlyAsked(request, {
    author: null,
    publishedYear: null,
    synopsis: null,
    genres,
    yearCheck: null,
    confidence: {
      author: 0,
      publishedYear: 0,
      synopsis: 0,
      genres: genres.length > 0 ? 0.6 : 0,
      yearCheck: 0,
    },
  });
};
