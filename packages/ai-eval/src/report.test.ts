import { describe, expect, it } from 'vitest';
import { envForProvider } from './env.js';
import { compareQuery } from './metrics/filterAccuracy.js';
import {
  autofillMarkdown,
  cutoffMarkdown,
  injectionMarkdown,
  summariseInjection,
  breakEvenMarkdown,
  resultName,
  EVAL_END,
  EVAL_START,
  isPartialResult,
  onlyCases,
  publishedResults,
  withEvalBlock,
  nlMarkdown,
  retrievalComparisonMarkdown,
  retrievalMarkdown,
  summariseNl,
  summariseAutofill,
  summariseRetrieval,
} from './report.js';
import type { RunInfo } from './report.js';
import type { AutofillRow } from './suites/autofill.js';
import type { InjectionRow } from './suites/injection.js';
import type { NlRow } from './suites/nlSearch.js';
import type { RetrievalRow } from './suites/retrieval.js';
import { checkAutofill, checkInjection, checkNl, checkRetrieval } from './thresholds.js';
import { AiProviderName, FieldSource } from '@library/contracts';

const nlRow = (overrides: Partial<NlRow> & Pick<NlRow, 'id'>): NlRow => {
  const expected = { q: null, genre: ['fantasy'] };
  const actual = overrides.actual === undefined ? expected : overrides.actual;
  return {
    language: 'en',
    text: 'fantasy',
    expected,
    actual,
    fields: compareQuery(expected, actual ?? { q: 'fantasy' }),
    costUsd: 0.001,
    latencyMs: 100,
    tokensIn: 1000,
    tokensCachedRead: 0,
    tokensCachedWrite: 0,
    fallbackUsed: false,
    throttleRetries: 0,
    error: null,
    ...overrides,
  };
};

const info: RunInfo = {
  suite: 'nl-search',
  provider: 'mock',
  model: 'mock-small',
  target: 'inprocess',
  setting: 'off',
  date: '2026-10-01',
};

describe('nl-search summary and report', () => {
  const rows = [
    nlRow({ id: 'a', latencyMs: 100 }),
    nlRow({ id: 'b', language: 'fr', latencyMs: 300, tokensCachedRead: 50 }),
    nlRow({ id: 'c', language: 'ar', actual: { q: 'fantasy' }, fallbackUsed: true }),
    nlRow({ id: 'd', actual: null, error: 'AI_UNAVAILABLE', throttleRetries: 2 }),
  ];

  it('counts errors apart from misses and keeps cost and latency to answered cases', () => {
    const summary = summariseNl(rows);
    expect(summary).toMatchObject({ cases: 4, errors: 1, cacheReadTokens: 50, throttleRetries: 2 });
    expect(summary.accuracy.exact).toBe(0.5);
    expect(summary.exactByLanguage).toEqual({ en: 0.5, fr: 1, ar: 0 });
    expect(summary.fallbackRate).toBe(0.25);
    expect(summary.cost.total).toBeCloseTo(0.003);
    expect(summary.latencyMs).toEqual({ p50: 100, p95: 300 });
  });

  it('lists every miss with what was expected and what came back', () => {
    const markdown = nlMarkdown(info, summariseNl(rows), rows);
    expect(markdown).toContain('| 4 | 50.0 % |');
    expect(markdown).toContain('| c | fantasy |');
    expect(markdown).toContain('`AI_UNAVAILABLE`');
    expect(markdown).not.toContain('| a | fantasy |');
  });

  it('states the break-even point, that padding never pays, or that it was not measured', () => {
    const off = summariseNl([nlRow({ id: 'x', costUsd: 0.003 })]);
    const paying = summariseNl([
      nlRow({ id: 'p1', costUsd: 0.0015, tokensCachedRead: 4200 }),
      nlRow({ id: 'p2', costUsd: 0.007, tokensCachedWrite: 4200 }),
      nlRow({ id: 'p3', costUsd: 0.0015, tokensCachedRead: 4200 }),
    ]);
    expect(breakEvenMarkdown(off, paying)).toContain('**4th search in a 5-minute cache window**');
    expect(nlMarkdown(info, paying, [])).toContain('$0.00700 / $0.00150');
    const never = summariseNl([
      nlRow({ id: 'n1', costUsd: 0.007, tokensCachedWrite: 4200 }),
      nlRow({ id: 'n2', costUsd: 0.004 }),
    ]);
    expect(breakEvenMarkdown(off, never)).toContain('never pays off');
    const warm = summariseNl([nlRow({ id: 'w1', costUsd: 0.0015, tokensCachedRead: 4200 })]);
    expect(breakEvenMarkdown(off, warm)).toContain('Break-even unknown');
    expect(nlMarkdown(info, warm, [])).toContain('| — / $0.00150 |');
  });

  it('fails the Mock gate when any pinned field drops', () => {
    expect(checkNl(summariseNl([nlRow({ id: 'ok' })]))).toEqual([]);
    const failures = checkNl(summariseNl([nlRow({ id: 'miss', actual: { q: 'fantasy' } })]));
    expect(failures).toContain('nl-search exact 0.0 % < 79.0 %');
    expect(failures.some(line => line.startsWith('nl-search genre'))).toBe(true);
  });
});

describe('retrieval summary and report', () => {
  const row = (
    id: string,
    kind: string,
    recall: number,
    latencyMs = 10,
    extra: Partial<RetrievalRow> = {}
  ): RetrievalRow => ({
    id,
    query: id,
    kind,
    mode: 'lexical',
    expected: [1],
    top: recall === 1 ? [1] : [],
    recall,
    latencyMs,
    modelLatencyMs: 0,
    costUsd: 0,
    reranked: false,
    rerankStatus: 'off',
    rank: recall === 1 ? 1 : null,
    throttleRetries: 0,
    fallbackUsed: false,
    error: null,
    ...extra,
  });
  const rows = [row('r1', 'title', 1), row('r2', 'author', 1), row('r3', 'description', 0, 50)];

  it('reports recall@5 overall and per kind', () => {
    const summary = summariseRetrieval(rows);
    expect(summary.recallAt5).toBe(0.667);
    expect(summary.byCategory).toEqual({ 'title/author': 1, description: 0 });
    expect(summary.latencyMs).toEqual({ p50: 10, p95: 50 });
    const markdown = retrievalMarkdown({ ...info, suite: 'retrieval' }, summary, rows);
    expect(markdown).toContain('| 3 | 66.7 % | 100.0 % | 0.0 % |');
    expect(markdown).toContain('| r3 | r3 | 1 | — |');
  });

  it('compares the modes: recall by kind, which known misses each fixes, and what the rerank adds', () => {
    const lexical = [
      row('r1', 'title', 1),
      row('r3', 'description', 0),
      row('r4', 'description', 0),
    ];
    const hybrid = [
      row('r1', 'title', 1, 30, { mode: 'hybrid', costUsd: 0.00001, modelLatencyMs: 120 }),
      row('r3', 'description', 1, 30, { mode: 'hybrid', costUsd: 0.00001, modelLatencyMs: 120 }),
      row('r4', 'description', 0, 30, { mode: 'hybrid', costUsd: 0.00001, modelLatencyMs: 120 }),
    ];
    const rerank = [
      row('r1', 'title', 1, 900, {
        mode: 'rerank',
        costUsd: 0.002,
        modelLatencyMs: 800,
        reranked: true,
      }),
      row('r3', 'description', 1, 900, {
        mode: 'rerank',
        costUsd: 0.002,
        modelLatencyMs: 800,
        reranked: true,
      }),
      row('r4', 'description', 1, 1500, {
        mode: 'rerank',
        costUsd: 0.002,
        modelLatencyMs: 1400,
        reranked: true,
      }),
    ];
    const note = retrievalComparisonMarkdown({ lexical, hybrid, rerank }, 'titan, rerank haiku');
    expect(note).toContain(
      '### Retrieval: lexical vs hybrid vs hybrid + rerank — titan, rerank haiku'
    );
    expect(note).toContain('| lexical | 33.3 % | 100.0 % | 0.0 % |');
    expect(note).toContain('| hybrid (RRF k = 60) | 66.7 % | 100.0 % | 50.0 % |');
    expect(note).toContain('| hybrid + rerank | 100.0 % | 100.0 % | 100.0 % |');
    expect(note).toContain('| r3 | r3 | yes | yes |');
    expect(note).toContain('| r4 | r4 | no | yes |');
    expect(note).toContain('Rerank adds +33.3 points recall@5');
    expect(note).toContain('$0.00199 per query');
    expect(note).toContain('| hit@1 | MRR@5 |');
  });

  it('scores nonsense apart: real recall excludes it, and a non-empty answer to nonsense is a miss', () => {
    const nonsense = (id: string, top: number[]) =>
      row(id, 'nonsense', top.length === 0 ? 1 : 0, 10, { expected: [], top });
    const mixed = [row('r1', 'title', 1), nonsense('n1', []), nonsense('n2', [7])];
    const summary = summariseRetrieval(mixed);
    expect(summary.recallAt5).toBe(1);
    expect(summary.byCategory).toEqual({ 'title/author': 1, nonsense: 0.5 });
    const markdown = retrievalMarkdown({ ...info, suite: 'retrieval' }, summary, mixed);
    expect(markdown).toContain('| title/author | nonsense (empty) |');
    expect(markdown).toContain('| n2 | n2 | (nothing) | 7 |');
  });

  it('gates the lexical baseline at its pinned recall', () => {
    const weak = [row('a', 'title', 1), row('b', 'description', 0), row('c', 'description', 0)];
    expect(checkRetrieval(summariseRetrieval(weak))).toEqual([
      'retrieval recall@5 33.3 % < 46.0 %',
    ]);
    expect(checkRetrieval(summariseRetrieval(rows))).toEqual([]);
  });
});

describe('envForProvider', () => {
  it('uses the provider-prefixed ids, falling back to AI_MODEL_* only for the active provider', () => {
    expect(envForProvider(AiProviderName.enum.mock, {})).toEqual({ AI_PROVIDER: 'mock' });
    expect(envForProvider(AiProviderName.enum.kimi, { KIMI_MODEL_SMALL: 'k-small' })).toMatchObject(
      {
        AI_PROVIDER: 'kimi',
        AI_PROVIDER_STRONG: '',
        AI_MODEL_SMALL: 'k-small',
        AI_MODEL_STRONG: 'k-small',
      }
    );
    expect(
      envForProvider(AiProviderName.enum.bedrock, {
        AI_PROVIDER: 'bedrock',
        AI_MODEL_SMALL: 's',
        AI_MODEL_STRONG: 't',
      })
    ).toMatchObject({ AI_MODEL_SMALL: 's', AI_MODEL_STRONG: 't' });
    expect(() =>
      envForProvider(AiProviderName.enum.kimi, { AI_PROVIDER: 'bedrock', AI_MODEL_SMALL: 's' })
    ).toThrow(/KIMI_MODEL_SMALL/);
  });
});

describe('autofill summary and report', () => {
  const draftRow = (overrides: Partial<AutofillRow> & Pick<AutofillRow, 'id'>): AutofillRow => ({
    language: 'en',
    input: { isbn: '9780441172719' },
    expected: {
      title: ['Dune'],
      author: ['Frank Herbert'],
      year: [1965],
      genres: ['science-fiction'],
      synopsis: true,
    },
    draft: null,
    fields: {
      title: true,
      author: true,
      year: true,
      genres: true,
      synopsis: true,
      exact: true,
      genresLenient: true,
      exactLenient: true,
    },
    sources: {
      title: FieldSource.enum.lookup,
      author: FieldSource.enum.lookup,
      year: FieldSource.enum.lookup,
      synopsis: FieldSource.enum.model,
      genres: FieldSource.enum.model,
    },
    lookupHit: true,
    modelCalled: true,
    fallbackUsed: false,
    aiUnavailable: false,
    costUsd: 0.002,
    latencyMs: 900,
    totalMs: 1500,
    tokensIn: 1800,
    tokensOut: 200,
    tokensCachedRead: 0,
    tokensCachedWrite: 0,
    throttleRetries: 0,
    error: null,
    ...overrides,
  });
  const rows = [
    draftRow({ id: 'a' }),
    draftRow({
      id: 'b',
      language: 'ar',
      lookupHit: false,
      fields: {
        title: true,
        author: true,
        year: false,
        genres: true,
        synopsis: true,
        exact: false,
        genresLenient: false,
        exactLenient: false,
      },
      sources: {
        title: FieldSource.enum.input,
        author: FieldSource.enum.input,
        year: FieldSource.enum.model,
        synopsis: FieldSource.enum.model,
        genres: FieldSource.enum.model,
      },
      totalMs: 2500,
    }),
    draftRow({
      id: 'c',
      modelCalled: false,
      costUsd: 0,
      latencyMs: 0,
      totalMs: 300,
      sources: {
        title: FieldSource.enum.empty,
        author: FieldSource.enum.empty,
        year: FieldSource.enum.empty,
        synopsis: FieldSource.enum.empty,
        genres: FieldSource.enum.empty,
      },
    }),
  ];

  it('reports field accuracy, lookup hits, what the model filled and how often it was right', () => {
    const summary = summariseAutofill(rows);
    expect(summary).toMatchObject({ cases: 3, errors: 0, lookupHitRate: 2 / 3, modelCalls: 2 });
    expect(summary.accuracy.exact).toBeCloseTo(2 / 3);
    expect(summary.exactByLanguage).toEqual({ en: 1, fr: 0, ar: 0 });
    expect(summary.modelFilled.year).toEqual({ filled: 1, correct: 0 });
    expect(summary.modelFilled.synopsis).toEqual({ filled: 2, correct: 2 });
    expect(summary.costPerCase).toBeCloseTo(0.004 / 3);
    expect(summary.totalMs).toEqual({ p50: 1500, p95: 2500 });
    const markdown = autofillMarkdown(
      { ...info, suite: 'autofill', setting: 'fixture' },
      summary,
      rows
    );
    expect(markdown).toContain('### autofill — mock (mock-small), inprocess, lookup fixture');
    expect(markdown).toContain('| exact strict / lenient |');
    expect(markdown).toContain('Year second opinion:');
    const flagged = autofillMarkdown({ ...info, suite: 'autofill', setting: 'fixture' }, summary, [
      draftRow({
        id: 'y',
        fields: {
          title: true,
          author: true,
          year: false,
          genres: true,
          synopsis: true,
          exact: false,
          genresLenient: true,
          exactLenient: false,
        },
        draft: {
          publishedYear: {
            value: 1800,
            source: 'lookup',
            confidence: 0.95,
            conflict: { value: 1859, confidence: 0.99 },
          },
        } as never,
      }),
    ]);
    expect(flagged).toContain('year: 1800 (lookup, AI says 1859)');
    expect(markdown).toContain('| b |');
    expect(markdown).not.toContain('| a |');
  });

  it('gates the Mock on its pinned autofill scores', () => {
    expect(checkAutofill(summariseAutofill([draftRow({ id: 'ok' })]))).toEqual([]);
    const bad = draftRow({
      id: 'bad',
      fields: {
        title: true,
        author: true,
        year: true,
        genres: false,
        synopsis: true,
        exact: false,
        genresLenient: false,
        exactLenient: false,
      },
    });
    expect(
      checkAutofill(summariseAutofill([bad])).some(line => line.startsWith('autofill genres'))
    ).toBe(true);
  });
});

describe('resultName', () => {
  it('keeps one file per suite, provider, target and variant', () => {
    expect(resultName({ ...info, setting: 'on' })).toBe('nl-search.mock.inprocess.padding-on');
    expect(resultName({ ...info, suite: 'autofill', setting: 'openlibrary' })).toBe(
      'autofill.mock.inprocess.lookup-openlibrary'
    );
    expect(
      resultName({
        ...info,
        suite: 'retrieval',
        provider: 'lexical',
        target: 'http',
        setting: 'n/a',
      })
    ).toBe('retrieval.lexical.http');
    expect(
      resultName({
        ...info,
        suite: 'retrieval',
        provider: 'bedrock',
        target: 'http',
        setting: 'rerank',
      })
    ).toBe('retrieval.bedrock.http.mode-rerank');
  });
});

describe('injection summary and report', () => {
  const injectionRow = (
    overrides: Partial<InjectionRow> & Pick<InjectionRow, 'id'>
  ): InjectionRow => ({
    kind: 'nl-search',
    language: 'en',
    violations: [],
    rawFollowed: false,
    influenced: false,
    fallbackUsed: false,
    finalGenres: [],
    costUsd: 0.003,
    latencyMs: 1000,
    throttleRetries: 0,
    error: null,
    ...overrides,
  });

  it('reports violations, raw follow and influence per surface, and fails on any violation', () => {
    const rows = [
      injectionRow({ id: 'n-1', rawFollowed: true }),
      injectionRow({
        id: 'a-1',
        kind: 'autofill',
        rawFollowed: true,
        influenced: true,
        finalGenres: ['thriller'],
      }),
      injectionRow({ id: 'a-2', kind: 'autofill', fallbackUsed: true }),
    ];
    const summary = summariseInjection(rows);
    expect(summary).toMatchObject({
      cases: 3,
      violations: 0,
      rawFollowRate: 2 / 3,
      influenceRate: 1 / 3,
    });
    expect(summary.byKind['autofill']).toMatchObject({
      cases: 2,
      rawFollowed: 1,
      influenced: 1,
      fallbacks: 1,
    });
    expect(checkInjection(summary)).toEqual([]);
    const markdown = injectionMarkdown(
      { ...info, suite: 'injection', setting: 'n/a' },
      summary,
      rows
    );
    expect(markdown).toContain('### injection — mock (mock-small), inprocess');
    expect(markdown).toContain('| a-1 | autofill |');
    const bad = summariseInjection([injectionRow({ id: 'x', violations: ['title changed'] })]);
    expect(checkInjection(bad)).toEqual([
      'injection: 1 case(s) with violations (x: title changed)',
    ]);
  });
});

describe('cutoff calibration report', () => {
  it('shows the sweep, the chosen value with its range, and the evidence on both sides', () => {
    const rows = [
      {
        id: 'd',
        kind: 'description',
        expected: [12],
        items: [{ id: 12, lexical: null, semantic: 0.42 }],
      },
      { id: 't', kind: 'title', expected: [1], items: [{ id: 1, lexical: 1, semantic: 0.2 }] },
      {
        id: 'n',
        kind: 'nonsense',
        expected: [],
        items: [{ id: 5, lexical: null, semantic: 0.18 }],
      },
    ];
    const markdown = cutoffMarkdown('titan', rows, [0, 0.2, 0.3, 0.4, 0.45]);
    expect(markdown).toContain('### Semantic cutoff — titan');
    expect(markdown).toContain('**Chosen: 0.30** (range 0.20–0.40)');
    expect(markdown).toContain('| 0.30 | 100.0 % | 100.0 % | 100.0 % |');
    expect(markdown).toContain('Strongest nonsense neighbour: 0.180 (n)');
    expect(markdown).toContain('Weakest real hit only the semantic leg finds: 0.420 (d)');
  });

  it('with must-pass cases: a column per case, and the constrained choice or "none"', () => {
    const rows = [
      {
        id: 'dune',
        kind: 'description',
        expected: [12],
        items: [{ id: 12, lexical: null, semantic: 0.2 }],
      },
      {
        id: 'n',
        kind: 'nonsense',
        expected: [],
        items: [{ id: 5, lexical: null, semantic: 0.25 }],
      },
    ];
    const markdown = cutoffMarkdown('titan', rows, [0, 0.1, 0.26], ['dune']);
    expect(markdown).toContain(
      '| min similarity | real recall@5 | nonsense empty | precision | dune |'
    );
    expect(markdown).toContain('| 0.10 | 100.0 % | 0.0 % | 50.0 % | yes |');
    expect(markdown).toContain('**No cutoff keeps dune and empties every nonsense query.**');
  });
});

describe('published result tables', () => {
  const run = (suite: RunInfo['suite'], cases?: string): RunInfo => ({
    suite,
    provider: 'mock',
    model: 'mock-small',
    target: 'inprocess',
    setting: suite === 'voice' ? 'tiffany' : 'none',
    ...(cases ? { cases } : {}),
    date: '2026-10-13',
  });

  it('names every partial run as partial, whatever the suite', () => {
    expect(resultName(run('voice'))).toBe('voice.mock.inprocess.voice-tiffany');
    expect(resultName(run('voice', onlyCases(['v-01'])))).toBe(
      'voice.mock.inprocess.voice-tiffany.cases-only-v-01'
    );
    expect(resultName(run('agent', 'holdout'))).toBe(
      'agent.mock.inprocess.judge-none.cases-holdout'
    );
    expect(resultName(run('agent', 'all'))).toBe('agent.mock.inprocess.judge-none');
    expect(isPartialResult(resultName(run('recommend', onlyCases(['p-01', 'p-02']))))).toBe(true);
    expect(isPartialResult(resultName(run('recommend')))).toBe(false);
  });

  it('publishes complete runs only, mock first within a suite', () => {
    expect(
      publishedResults([
        'agent.bedrock.inprocess.judge-x.md',
        'agent.bedrock.inprocess.judge-x.cases-tuned.md',
        'agent.mock.inprocess.judge-none.md',
        'agent.mock.inprocess.judge-none.json',
        'voice.mock.inprocess.voice-tiffany.cases-only-v-01.md',
        'nl-search.bedrock.inprocess.zz-break-even.md',
        'nl-search.bedrock.inprocess.padding-off.md',
      ])
    ).toEqual([
      'agent.mock.inprocess.judge-none.md',
      'agent.bedrock.inprocess.judge-x.md',
      'nl-search.bedrock.inprocess.padding-off.md',
      'nl-search.bedrock.inprocess.zz-break-even.md',
    ]);
  });

  it('replaces only the marked block and keeps every character of the tables', () => {
    const doc = `# Evaluation\n\nintro\n\n${EVAL_START}\nold\n${EVAL_END}\n\nafter\n`;
    const next = withEvalBlock(doc, ["cost $& and $' and $$"], 'pnpm eval:docs');
    expect(next).toContain("cost $& and $' and $$");
    expect(next).not.toContain('old');
    expect(next.startsWith('# Evaluation\n\nintro\n\n')).toBe(true);
    expect(next.endsWith('\n\nafter\n')).toBe(true);
  });

  it('appends the block to a document without one, and refuses a block without its end', () => {
    expect(withEvalBlock('# Evaluation\n', ['t'], 'x')).toMatch(
      new RegExp(`^# Evaluation\\n\\n${EVAL_START}[\\s\\S]*${EVAL_END}\\n$`)
    );
    expect(() => withEvalBlock(`${EVAL_START}\nno end`, ['t'], 'x')).toThrow(EVAL_END);
  });
});
