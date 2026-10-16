#!/usr/bin/env node
import {
  BUDGETS,
  agentMockPolicy,
  createHttpClient,
  estimateCostUsd,
  minSimilarityFor,
  mockToolHandlers,
  priceFor,
  selectEmbeddingProvider,
  selectLlmProvider,
  selectVoiceProvider,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_VOICE_ID,
} from '@library/ai';
import {
  AiStatus,
  apiPaths,
  AiFeature,
  AiProviderName,
  EmbeddingExpansion,
  AiTier,
  EmbeddingProviderName,
  VoiceProviderName,
} from '@library/contracts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_ACCOUNTS, lookupFixtures } from '@library/domain-config/seed';
import type { LookupFixtureEntry } from '@library/domain-config/seed';
import { REPO_ROOT, envForProvider, loadApiEnv } from './env.js';
import { DEFAULT_MAX_COST_USD, checkBudget, estimateRun } from './estimate.js';
import type { Estimate } from './estimate.js';
import {
  agentMarkdown,
  summariseAgent,
  summariseVoice,
  voiceMarkdown,
  summariseRecommend,
  recommendMarkdown,
  autofillMarkdown,
  cutoffMarkdown,
  injectionMarkdown,
  summariseInjection,
  breakEvenMarkdown,
  nlMarkdown,
  retrievalComparisonMarkdown,
  retrievalMarkdown,
  summariseAutofill,
  summariseNl,
  summariseRetrieval,
  RESULTS_DIR,
  writeNote,
  writeResult,
  ALL_CASES,
  onlyCases,
} from './report.js';
import type { NlSummary, RunInfo } from './report.js';
import {
  createLiveLookup,
  createRecordingLookup,
  createReplayLookup,
  loadAutofillCases,
  runAutofillInProcess,
} from './suites/autofill.js';
import { loadNlCases, runNlSearchHttp, runNlSearchInProcess } from './suites/nlSearch.js';
import {
  loadRetrievalCases,
  runRetrievalCalibrationHttp,
  runRetrievalHttp,
  runRetrievalHybridHttp,
} from './suites/retrieval.js';
import type { RetrievalMode, RetrievalRow } from './suites/retrieval.js';
import {
  checkAgent,
  checkAutofill,
  checkInjection,
  checkNl,
  checkRetrieval,
  checkVoice,
  checkRecommend,
} from './thresholds.js';
import { loadRecommendCases, runRecommendInProcess } from './suites/recommend.js';
import {
  fixtureSeconds,
  loadVoiceCases,
  runVoiceInProcess,
  voiceCaseWorstUsd,
} from './suites/voice.js';
import { loadAgentCases, runAgentInProcess } from './suites/agent.js';
import type { AgentCaseSet } from './suites/agent.js';
import { loadInjectionCases, runInjection } from './suites/injection.js';
import { LOOKUP_SOURCE } from '@library/domain-config';

const PENDING: Record<string, string> = {};

const arg = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};

const usage = (message: string): never => {
  console.error(`eval: ${message}`);
  process.exit(3);
};

loadApiEnv();
const suiteArg = arg('suite', 'nl-search');
const PADDING = { off: 'off', on: 'on', both: 'both' } as const;
const NO_JUDGE = 'none';

const providerArg = arg('provider', AiProviderName.enum.mock);
const target = arg('target', 'inprocess');
const paddingArg = arg('cache-padding', PADDING.off);
const lookupArg = arg('lookup', LOOKUP_SOURCE.fixture);
const modeArg = arg('mode', 'lexical');
const judgeArg = arg(
  'judge',
  providerArg === AiProviderName.enum.mock ? NO_JUDGE : AiProviderName.enum.bedrock
);
const casesArg = arg('cases', ALL_CASES);
const voiceArg = arg('voice', VoiceProviderName.enum.mock);
const onlyArg = arg('only', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);
const tierArg = arg('tier', process.env['AI_CHAT_TIER'] ?? AiTier.enum.small);
const mustPass = arg('must-pass', '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const embeddingSlug = (embeddings: AiStatus['embeddings']) =>
  [
    embeddings.provider,
    (embeddings.model ?? 'default')
      .replace(/^(eu|us|apac)\./, '')
      .replace(/^(amazon|cohere)\./, '')
      .replace(/[^a-z0-9]+/gi, '-'),
    embeddings.dimensions,
    embeddings.expansion === EmbeddingExpansion.enum['fr-ar']
      ? EmbeddingExpansion.enum['fr-ar']
      : null,
  ]
    .filter(Boolean)
    .join('-');
const recordFixtures = process.argv.includes('--record-fixtures');
const FIXTURES_PATH = join(REPO_ROOT, 'packages/domain-config/src/books/seed/lookup-fixtures.json');
const apiBase = arg('api', process.env['EVAL_API_URL'] ?? 'http://localhost:4000');
const maxUsd = Number(process.env['EVAL_MAX_COST_USD'] ?? DEFAULT_MAX_COST_USD);

if (!AiProviderName.safeParse(providerArg).success) usage(`unknown --provider ${providerArg}`);
if (!['inprocess', 'http'].includes(target)) usage(`--target must be inprocess or http`);
if (!AiTier.safeParse(tierArg).success) usage('--tier must be small or strong');
if (!['tuned', 'holdout', ALL_CASES].includes(casesArg))
  usage('--cases must be tuned, holdout or all');
if (judgeArg !== NO_JUDGE && !AiProviderName.safeParse(judgeArg).success)
  usage(`unknown --judge ${judgeArg}`);
if (!Object.values(PADDING).some(value => value === paddingArg))
  usage(`--cache-padding must be off, on or both`);
if (!Object.values(LOOKUP_SOURCE).some(value => value === lookupArg))
  usage(`--lookup must be fixture or openlibrary`);
if (!['lexical', 'hybrid', 'rerank', 'all', 'calibrate'].includes(modeArg))
  usage('--mode must be lexical, hybrid, rerank, all or calibrate');
if (recordFixtures && lookupArg !== LOOKUP_SOURCE.openLibrary)
  usage('--record-fixtures needs --lookup openlibrary');
const provider = providerArg as AiProviderName;
const suites =
  suiteArg === 'all'
    ? ['nl-search', 'retrieval', 'autofill', 'injection', 'agent', 'voice', 'recommend']
    : [suiteArg];
const date = new Date().toISOString();
const failures: string[] = [];

const http = () =>
  createHttpClient({
    baseUrl: apiBase,
    email: process.env['EVAL_EMAIL'] ?? DEMO_ACCOUNTS.reader.email,
    password: process.env['EVAL_PASSWORD'] ?? DEMO_ACCOUNTS.password,
  });

for (const suite of suites) {
  if (PENDING[suite]) {
    console.log(`\n${suite}: not available yet — arrives with ${PENDING[suite]}.`);
    continue;
  }

  if (suite === 'nl-search') {
    const cases = loadNlCases();
    if (target === 'http') {
      const client = http();
      const status = AiStatus.parse((await client.public<unknown>(apiPaths.ai.status)).data);
      const model = status.tiers.small.model;
      const estimate = estimateRun(model, AiFeature.enum.NL_SEARCH, cases.length);
      console.log(
        `nl-search over ${apiBase}: server runs ${status.tiers.small.provider} ${model}; worst case $${estimate.totalUsd.toFixed(4)} for ${cases.length} calls (max $${maxUsd})`
      );
      const verdict = checkBudget(estimate, status.tiers.small.provider, maxUsd);
      if (!verdict.ok) {
        console.error(`refused before any call: ${verdict.reason}`);
        process.exit(2);
      }
      const rows = await runNlSearchHttp(cases, client);
      const info: RunInfo = {
        suite: 'nl-search',
        provider: status.tiers.small.provider,
        model,
        target: 'http',
        setting: 'server',
        date,
      };
      const summary = summariseNl(rows);
      const markdown = nlMarkdown(info, summary, rows);
      writeResult(info, summary, rows, markdown);
      console.log(`\n${markdown}`);
      if (info.provider === AiProviderName.enum.mock) failures.push(...checkNl(summary));
      continue;
    }

    let env;
    try {
      env = envForProvider(provider);
    } catch (error) {
      usage((error as Error).message);
    }
    const llm = selectLlmProvider(env!, { tools: mockToolHandlers });
    const model = llm.tiers.small.model;
    const settings = paddingArg === PADDING.both ? [false, true] : [paddingArg === PADDING.on];
    const estimate = estimateRun(model, AiFeature.enum.NL_SEARCH, cases.length * settings.length);
    console.log(
      `nl-search in process: ${provider} ${model}, cache padding ${paddingArg}; ${estimate.calls} calls, worst case $${estimate.totalUsd.toFixed(4)} (max $${maxUsd})`
    );
    const verdict = checkBudget(estimate, provider, maxUsd);
    if (!verdict.ok) {
      console.error(`refused before any call: ${verdict.reason}`);
      process.exit(2);
    }
    const summaries: Record<string, NlSummary> = {};
    for (const padded of settings) {
      const rows = await runNlSearchInProcess(cases, llm, padded);
      const info: RunInfo = {
        suite: 'nl-search',
        provider,
        model,
        target: 'inprocess',
        setting: padded ? PADDING.on : PADDING.off,
        date,
      };
      const summary = summariseNl(rows);
      summaries[info.setting] = summary;
      const markdown = nlMarkdown(info, summary, rows);
      writeResult(info, summary, rows, markdown);
      console.log(`\n${markdown}`);
      if (provider === AiProviderName.enum.mock) failures.push(...checkNl(summary));
    }
    const unpadded = summaries[PADDING.off];
    const padded = summaries[PADDING.on];
    if (unpadded && padded) {
      const note = breakEvenMarkdown(unpadded, padded);
      writeNote(`nl-search.${provider}.inprocess.zz-break-even`, note);
      console.log(`\n${note}`);
    }
    continue;
  }

  if (suite === 'retrieval') {
    if (target !== 'http') {
      console.log(
        '\nretrieval: needs a running API (--target http); every mode measures the real search endpoints.'
      );
      continue;
    }
    const cases = loadRetrievalCases();
    const client = http();
    if (modeArg === 'calibrate') {
      const calibrationStatus = AiStatus.parse(
        (await client.public<unknown>(apiPaths.ai.status)).data
      );
      if (calibrationStatus.search.minSimilarity !== 0)
        usage(
          `calibration needs a server without a cutoff (HYBRID_MIN_SIMILARITY=0); this one has ${calibrationStatus.search.minSimilarity}`
        );
      const embeddings = calibrationStatus.embeddings;
      console.log(
        `calibrating the semantic cutoff over ${apiPaths.ai.search}: ${embeddings.model}, ${cases.length} queries at limit 20 (query embeddings only, no model call)`
      );
      const rows = await runRetrievalCalibrationHttp(cases, client);
      const thresholds = Array.from({ length: 61 }, (_, i) => i / 100);
      const label = `${embeddings.model ?? embeddings.provider} (${embeddings.dimensions} dims${embeddings.expansion === EmbeddingExpansion.enum['fr-ar'] ? ', FR/AR expansion' : ''})`;
      const note = cutoffMarkdown(label, rows, thresholds, mustPass);
      writeNote(`retrieval.${embeddingSlug(embeddings)}.http.zz-cutoff`, note);
      writeFileSync(
        join(RESULTS_DIR, `retrieval.${embeddingSlug(embeddings)}.http.calibration.json`),
        `${JSON.stringify({ model: embeddings.model ?? embeddings.provider, date, rows }, null, 2)}\n`
      );
      console.log(`\n${note}`);
      continue;
    }
    const modes: RetrievalMode[] =
      modeArg === 'all' ? ['lexical', 'hybrid', 'rerank'] : [modeArg as RetrievalMode];
    const status = AiStatus.parse((await client.public<unknown>(apiPaths.ai.status)).data);
    if (modes.some(mode => mode !== 'lexical') && !status.features.HYBRID_SEARCH)
      usage('the server has hybrid search switched off');
    if (modes.includes('rerank')) {
      const estimate = estimateRun(status.tiers.small.model, AiFeature.enum.RERANK, cases.length);
      console.log(
        `retrieval rerank over ${apiPaths.ai.search}: server reranks with ${status.tiers.small.provider} ${status.tiers.small.model}; worst case $${estimate.totalUsd.toFixed(4)} for ${cases.length} calls (max $${maxUsd})`
      );
      const verdict = checkBudget(estimate, status.tiers.small.provider, maxUsd);
      if (!verdict.ok) {
        console.error(`refused before any call: ${verdict.reason}`);
        process.exit(2);
      }
    }
    const runs: Partial<Record<RetrievalMode, RetrievalRow[]>> = {};
    for (const mode of modes) {
      const rows =
        mode === 'lexical'
          ? await runRetrievalHttp(cases, client)
          : await runRetrievalHybridHttp(cases, client, mode === 'rerank');
      runs[mode] = rows;
      const info: RunInfo =
        mode === 'lexical'
          ? {
              suite: 'retrieval',
              provider: 'lexical',
              model: 'GET /books (trigram + ILIKE)',
              target: 'http',
              setting: 'n/a',
              date,
            }
          : {
              suite: 'retrieval',
              provider: embeddingSlug(status.embeddings),
              model: `${status.embeddings.model} (${status.embeddings.dimensions} dims${status.embeddings.expansion === EmbeddingExpansion.enum['fr-ar'] ? ', FR/AR expansion' : ''}, cutoff ${status.search.minSimilarity}) + RRF k = 60${mode === 'rerank' ? ` + ${status.tiers.small.model} rerank` : ''}`,
              target: 'http',
              setting: mode,
              date,
            };
      const summary = summariseRetrieval(rows);
      const markdown = retrievalMarkdown(info, summary, rows);
      writeResult(info, summary, rows, markdown);
      console.log(`\n${markdown}`);
      if (mode === 'lexical') failures.push(...checkRetrieval(summary));
    }
    if (runs.lexical && runs.hybrid && runs.rerank) {
      const note = retrievalComparisonMarkdown(
        {
          lexical: runs.lexical,
          hybrid: runs.hybrid,
          rerank: runs.rerank,
        },
        `${status.embeddings.model}, rerank ${status.tiers.small.model}`
      );
      writeNote(`retrieval.${embeddingSlug(status.embeddings)}.http.zz-comparison`, note);
      console.log(`\n${note}`);
    }
    continue;
  }

  if (suite === 'autofill') {
    if (target !== 'inprocess') usage('autofill runs in process (--target inprocess)');
    const cases = loadAutofillCases();
    if (lookupArg === LOOKUP_SOURCE.fixture && lookupFixtures.entries.length === 0)
      usage('no recorded lookups yet: run once with --lookup openlibrary --record-fixtures');
    let env;
    try {
      env = envForProvider(provider);
    } catch (error) {
      usage((error as Error).message);
    }
    const llm = selectLlmProvider(env!, { tools: mockToolHandlers });
    const model = llm.tiers.small.model;
    const estimate = estimateRun(model, AiFeature.enum.AUTOFILL, cases.length);
    console.log(
      `autofill in process: ${provider} ${model}, lookup ${lookupArg}; at most ${estimate.calls} model calls, worst case $${estimate.totalUsd.toFixed(4)} (max $${maxUsd})`
    );
    const verdict = checkBudget(estimate, provider, maxUsd);
    if (!verdict.ok) {
      console.error(`refused before any call: ${verdict.reason}`);
      process.exit(2);
    }
    const recorded: LookupFixtureEntry[] = [];
    const lookup =
      lookupArg === LOOKUP_SOURCE.fixture
        ? createReplayLookup(lookupFixtures.entries)
        : recordFixtures
          ? createRecordingLookup(createLiveLookup(), recorded)
          : createLiveLookup();
    const rows = await runAutofillInProcess(cases, llm, lookup);
    if (recordFixtures) {
      writeFileSync(
        FIXTURES_PATH,
        `${JSON.stringify({ recorded: date.slice(0, 10), source: LOOKUP_SOURCE.openLibrary, entries: recorded }, null, 2)}\n`
      );
      console.log(`recorded ${recorded.length} lookups into ${FIXTURES_PATH}`);
    }
    const info: RunInfo = {
      suite: 'autofill',
      provider,
      model,
      target: 'inprocess',
      setting: lookupArg,
      date,
    };
    const summary = summariseAutofill(rows);
    const markdown = autofillMarkdown(info, summary, rows);
    writeResult(info, summary, rows, markdown);
    console.log(`\n${markdown}`);
    if (provider === AiProviderName.enum.mock && lookupArg === LOOKUP_SOURCE.fixture)
      failures.push(...checkAutofill(summary));
    continue;
  }

  if (suite === 'injection') {
    if (target !== 'inprocess') usage('injection runs in process (--target inprocess)');
    const cases = loadInjectionCases();
    let env;
    try {
      env = envForProvider(provider);
    } catch (error) {
      usage((error as Error).message);
    }
    const llm = selectLlmProvider(env!, { tools: mockToolHandlers });
    const model = llm.tiers.small.model;
    const nl = estimateRun(
      model,
      AiFeature.enum.NL_SEARCH,
      cases.filter(c => c.kind === 'nl-search').length
    );
    const af = estimateRun(
      model,
      AiFeature.enum.AUTOFILL,
      cases.filter(c => c.kind === 'autofill').length
    );
    const chatModel = llm.tiers[tierArg as AiTier].model;
    const agentCases = cases.filter(c => c.kind === 'agent').length;
    const agentPerCase =
      estimateCostUsd(chatModel, BUDGETS.AGENT_CHAT) * (BUDGETS.AGENT_CHAT.maxSteps ?? 6);
    const ag: Estimate = {
      model: chatModel,
      calls: agentCases,
      perCallUsd: agentPerCase,
      totalUsd: Math.round(agentPerCase * agentCases * 1e6) / 1e6,
      priced: priceFor(chatModel).known,
    };
    const worst = Math.round((nl.totalUsd + af.totalUsd + ag.totalUsd) * 1e6) / 1e6;
    console.log(
      `injection in process: ${provider} ${model} (agent on the ${tierArg} tier: ${chatModel}); ${cases.length} cases, worst case $${worst.toFixed(4)} (max $${maxUsd})`
    );
    for (const estimate of [nl, af, ag]) {
      const verdict = checkBudget({ ...estimate, totalUsd: worst }, provider, maxUsd);
      if (!verdict.ok) {
        console.error(`refused before any call: ${verdict.reason}`);
        process.exit(2);
      }
    }
    const rows = await runInjection(cases, llm, undefined, {
      tier: tierArg as AiTier,
    });
    const info: RunInfo = {
      suite: 'injection',
      provider,
      model,
      target: 'inprocess',
      setting: 'n/a',
      date,
    };
    const summary = summariseInjection(rows);
    const markdown = injectionMarkdown(info, summary, rows);
    writeResult(info, summary, rows, markdown);
    console.log(`\n${markdown}`);
    failures.push(...checkInjection(summary));
    continue;
  }

  if (suite === 'recommend') {
    if (target !== 'inprocess') usage('recommend runs in process (--target inprocess)');
    const cases = loadRecommendCases().filter(c => onlyArg.length === 0 || onlyArg.includes(c.id));
    let env;
    try {
      env = envForProvider(provider);
    } catch (error) {
      usage((error as Error).message);
    }
    const llm = selectLlmProvider(env!, { tools: mockToolHandlers });
    const tier = BUDGETS.RECOMMEND.tier;
    const model = llm.tiers[tier].model;
    const embeddings = selectEmbeddingProvider(
      provider === AiProviderName.enum.mock
        ? {
            EMBEDDING_PROVIDER: EmbeddingProviderName.enum.mock,
            EMBEDDING_DIMENSIONS: String(DEFAULT_EMBEDDING_DIMENSIONS),
          }
        : process.env
    );
    const estimate = estimateRun(model, AiFeature.enum.RECOMMEND, cases.length);
    console.log(
      `recommend in process (${tier} tier): ${llm.tiers[tier].provider} ${model}, candidates by genre and by meaning on ${embeddings.model}; ${cases.length} profiles, worst case $${estimate.totalUsd.toFixed(4)} (max $${maxUsd})`
    );
    const verdict = checkBudget(estimate, provider, maxUsd);
    if (!verdict.ok) {
      console.error(`refused before any call: ${verdict.reason}`);
      process.exit(2);
    }
    const rows = await runRecommendInProcess(cases, llm, { embeddings });
    const info: RunInfo = {
      suite: 'recommend',
      provider,
      model,
      target: 'inprocess',
      setting: 'n/a',
      ...(onlyArg.length > 0 ? { cases: onlyCases(onlyArg) } : {}),
      date,
    };
    const summary = summariseRecommend(rows);
    const markdown = recommendMarkdown(info, summary, rows);
    writeResult(info, summary, rows, markdown);
    console.log(`\n${markdown}`);
    failures.push(...checkRecommend(summary, provider === AiProviderName.enum.mock));
    continue;
  }

  if (suite === 'voice') {
    if (!VoiceProviderName.safeParse(voiceArg).success) usage('--voice must be mock or nova-sonic');
    const cases = loadVoiceCases().filter(c => onlyArg.length === 0 || onlyArg.includes(c.id));
    let voice;
    try {
      voice = selectVoiceProvider({
        VOICE_PROVIDER: voiceArg,
        VOICE_MODEL: process.env['VOICE_MODEL'],
        VOICE_AWS_REGION: process.env['VOICE_AWS_REGION'],
      });
    } catch (error) {
      usage((error as Error).message);
    }
    const real = voiceArg === VoiceProviderName.enum['nova-sonic'];
    const embeddings = selectEmbeddingProvider(
      real
        ? process.env
        : {
            EMBEDDING_PROVIDER: EmbeddingProviderName.enum.mock,
            EMBEDDING_DIMENSIONS: String(DEFAULT_EMBEDDING_DIMENSIONS),
          }
    );
    const minSimilarity = minSimilarityFor(
      embeddings.model,
      real && process.env['HYBRID_MIN_SIMILARITY']
        ? Number(process.env['HYBRID_MIN_SIMILARITY'])
        : undefined
    );
    const maxSeconds = 30;
    const perCase = voiceCaseWorstUsd(voice!.model, maxSeconds);
    const total = Math.round(perCase * cases.length * 1e6) / 1e6;
    const audioSeconds = cases.reduce(
      (sum, c) => sum + fixtureSeconds(c.id) + (c.bargeIn ? fixtureSeconds(c.bargeIn.id) : 0),
      0
    );
    console.log(
      `voice in process: ${voice!.name} ${voice!.model}${voice!.region ? ` (${voice!.region})` : ''}, voice ${process.env['VOICE_ID'] ?? DEFAULT_VOICE_ID}; ${cases.length} spoken requests (${audioSeconds.toFixed(1)} s of speech), sessions capped at ${maxSeconds} s; worst case $${perCase.toFixed(4)} per request, $${total.toFixed(4)} for all (step 0 rates: speech ${'≈'}9.5 tokens/s in, 25 out; max $${maxUsd})`
    );
    if (real && total > maxUsd) {
      console.error(
        `refused before any call: estimated $${total.toFixed(4)} exceeds EVAL_MAX_COST_USD=$${maxUsd}`
      );
      process.exit(2);
    }
    const rows = await runVoiceInProcess(cases, voice!, {
      llm: selectLlmProvider(
        { AI_PROVIDER: AiProviderName.enum.mock },
        { tools: mockToolHandlers }
      ),
      embeddings,
      minSimilarity,
      maxSeconds,
      voiceId: process.env['VOICE_ID'] ?? DEFAULT_VOICE_ID,
      ...(real ? { maxUsd } : {}),
    });
    const info: RunInfo = {
      suite: 'voice',
      provider: voice!.name,
      model: voice!.model,
      target: 'inprocess',
      setting: process.env['VOICE_ID'] ?? DEFAULT_VOICE_ID,
      ...(onlyArg.length > 0 ? { cases: onlyCases(onlyArg) } : {}),
      date,
    };
    const summary = summariseVoice(rows);
    const markdown = voiceMarkdown(info, summary, rows);
    writeResult(info, summary, rows, markdown);
    console.log(`\n${markdown}`);
    failures.push(...checkVoice(summary));
    continue;
  }

  if (suite === 'agent') {
    if (target !== 'inprocess') usage('agent runs in process (--target inprocess)');
    const cases = loadAgentCases(casesArg as AgentCaseSet).filter(
      c => onlyArg.length === 0 || onlyArg.includes(c.id)
    );
    if (cases.length === 0) usage(`--only matched no case`);
    let env;
    let judgeEnv;
    try {
      env = envForProvider(provider);
      judgeEnv = judgeArg === NO_JUDGE ? null : envForProvider(judgeArg as AiProviderName);
    } catch (error) {
      usage((error as Error).message);
    }
    const llm = selectLlmProvider(env!, { tools: mockToolHandlers, agent: agentMockPolicy });
    const judge = judgeEnv ? selectLlmProvider(judgeEnv, { tools: mockToolHandlers }) : null;
    const embeddings = selectEmbeddingProvider(
      provider === AiProviderName.enum.mock
        ? {
            EMBEDDING_PROVIDER: EmbeddingProviderName.enum.mock,
            EMBEDDING_DIMENSIONS: String(DEFAULT_EMBEDDING_DIMENSIONS),
          }
        : process.env
    );
    const minSimilarity = minSimilarityFor(
      embeddings.model,
      provider === AiProviderName.enum.mock || !process.env['HYBRID_MIN_SIMILARITY']
        ? undefined
        : Number(process.env['HYBRID_MIN_SIMILARITY'])
    );
    const chatTier = tierArg as AiTier;
    const model = llm.tiers[chatTier].model;
    const budget = BUDGETS.AGENT_CHAT;
    const agentWorst = estimateCostUsd(model, budget) * (budget.maxSteps ?? 6);
    const judgeWorst = judge ? estimateCostUsd(judge.tiers.small.model, BUDGETS.JUDGE) * 2 : 0;
    const perCaseWorstUsd = Math.round((agentWorst + judgeWorst) * 1e6) / 1e6;
    const totalWorst = Math.round(perCaseWorstUsd * cases.length * 1e6) / 1e6;
    console.log(
      `agent in process (${chatTier} tier): ${llm.tiers[chatTier].provider} ${model}, judge ${judge ? `${judge.tiers.small.provider} ${judge.tiers.small.model}` : NO_JUDGE}, search by meaning on ${embeddings.model} (cutoff ${minSimilarity}); ${cases.length} cases, worst case $${perCaseWorstUsd.toFixed(4)} per case, $${totalWorst.toFixed(4)} for all (max $${maxUsd})`
    );
    const paid =
      provider !== AiProviderName.enum.mock ||
      (judge !== null && judgeArg !== AiProviderName.enum.mock);
    if (paid) {
      const unpriced = [model, judge?.tiers.small.model].filter(
        (id): id is string => id !== undefined && !priceFor(id).known
      );
      if (unpriced.length > 0) {
        console.error(`refused before any call: no price for ${unpriced.join(', ')} in pricing.ts`);
        process.exit(2);
      }
      if (perCaseWorstUsd > maxUsd) {
        console.error(
          `refused before any call: one case could cost $${perCaseWorstUsd.toFixed(4)} > EVAL_MAX_COST_USD=$${maxUsd}`
        );
        process.exit(2);
      }
      if (totalWorst > maxUsd)
        console.log(
          `the worst case for all cases exceeds the cap: the run stops before any case that could take the spend past $${maxUsd} (skipped cases are reported)`
        );
    }
    const rows = await runAgentInProcess(cases, llm, judge, undefined, {
      tier: chatTier,
      embeddings,
      minSimilarity,
      ...(paid ? { maxUsd, perCaseWorstUsd } : {}),
    });
    const info: RunInfo = {
      suite: 'agent',
      provider: llm.tiers[chatTier].provider,
      model,
      target: 'inprocess',
      setting: judge ? judge.tiers.small.model : NO_JUDGE,
      cases: onlyArg.length > 0 ? onlyCases(onlyArg) : casesArg,
      date,
    };
    const summary = summariseAgent(rows);
    const markdown = agentMarkdown(info, summary, rows);
    const bySet = Object.fromEntries(
      (['tuned', 'holdout'] as const).map(set => [
        set,
        summariseAgent(rows.filter(row => row.set === set)),
      ])
    );
    writeResult(info, { all: summary, ...bySet }, rows, markdown);
    console.log(`\n${markdown}`);
    const tunedRows = rows.filter(row => row.set === 'tuned');
    failures.push(
      ...checkAgent(
        tunedRows.length > 0 ? summariseAgent(tunedRows) : summary,
        provider === AiProviderName.enum.mock
      ),
      ...(summary.checks.noMutation < 1 ? ['agent: a turn wrote to the shelf'] : [])
    );
    continue;
  }

  usage(`unknown --suite ${suite}`);
}

if (failures.length > 0) {
  console.error(`\nthresholds failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
