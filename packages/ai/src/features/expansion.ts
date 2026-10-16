import { ExpansionModelOutput, AiFeature } from '@library/contracts';
import { BUDGETS } from '../cost/budgets.js';
import type { EmbeddingSource, Ports } from '../ports/index.js';
import { composeSystem } from '../prompts/ordering.js';
import type { MockToolHandler } from '../providers/mock/index.js';
import { ProviderUnavailableError } from '../providers/types.js';
import type { LlmProvider } from '../providers/types.js';
import { generateValidated } from '../safety/generateValidated.js';
import { dataBlock } from '../safety/untrusted.js';
import { inputJsonSchema } from '../tools/registry.js';
import { contentHash } from './embeddings.js';
import { runFeature } from './run.js';

export const EXPANSION_TOOL = 'summarise_book';

const INSTRUCTIONS = `You write short catalog summaries so that readers searching in French or Arabic can find a book.
The book is given as data. Answer only by calling the ${EXPANSION_TOOL} tool, once, with:
- fr: one or two sentences in French describing what the book is about (plot, setting, theme), keeping proper names;
- ar: the same in Modern Standard Arabic.
No spoilers of the ending, no opinions, nothing that is not in the data.`;

const THROTTLE = /\b429\b|too many requests|throttl/i;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ExpansionDeps {
  llm: LlmProvider;
  ports: Ports;
  backoffMs?: number;
  throttleRetries?: number;
}

export interface ExpansionResult {
  sources: EmbeddingSource[];
  generated: number;
  reused: number;
  failed: number;
  throttleRetries: number;
  costUsd: number;
}

const expanded = (source: EmbeddingSource, fr: string, ar: string): EmbeddingSource => {
  const text = `${source.text}\n\nFR: ${fr}\nAR: ${ar}`;
  return { id: source.id, text, contentHash: contentHash(text) };
};

export const expandForEmbedding = async (
  deps: ExpansionDeps,
  sources: EmbeddingSource[]
): Promise<ExpansionResult> => {
  const model = deps.llm.tiers[BUDGETS.EXPANSION.tier].model;
  const stored = await deps.ports.expansions.all();
  const result: ExpansionResult = {
    sources: [],
    generated: 0,
    reused: 0,
    failed: 0,
    throttleRetries: 0,
    costUsd: 0,
  };
  const system = composeSystem({ instructions: INSTRUCTIONS, vocabulary: '' });
  for (const source of sources) {
    const current = stored.get(source.id);
    if (current && current.sourceHash === source.contentHash && current.model === model) {
      result.sources.push(expanded(source, current.fr, current.ar));
      result.reused += 1;
      continue;
    }
    let summary: ExpansionModelOutput | null = null;
    for (let retry = 0; ; retry += 1) {
      try {
        const outcome = await runFeature(
          {
            feature: AiFeature.enum.EXPANSION,
            llm: deps.llm,
            trace: deps.ports.trace,
            actor: null,
            requestId: null,
          },
          async signal => {
            const answer = await generateValidated(
              deps.llm,
              {
                tier: BUDGETS.EXPANSION.tier,
                system: [...system, { text: dataBlock('book', { text: source.text }) }],
                messages: [{ role: 'user', content: 'Summarise this book in French and Arabic.' }],
                maxOutputTokens: BUDGETS.EXPANSION.maxOutputTokens,
                signal,
              },
              {
                name: EXPANSION_TOOL,
                description: 'French and Arabic summaries.',
                schema: ExpansionModelOutput,
              },
              inputJsonSchema
            );
            return {
              value: answer.ok ? answer.value : null,
              attempts: answer.attempts,
              fallbackUsed: !answer.ok,
            };
          }
        );
        result.costUsd += outcome.meta.costUsd;
        summary = outcome.value;
        break;
      } catch (error) {
        const throttled = error instanceof ProviderUnavailableError && THROTTLE.test(error.message);
        if (!throttled || retry >= (deps.throttleRetries ?? 6)) break;
        result.throttleRetries += 1;
        await sleep(Math.min(30_000, (deps.backoffMs ?? 2000) * 2 ** retry));
      }
    }
    if (summary === null) {
      result.sources.push(source);
      result.failed += 1;
      continue;
    }
    await deps.ports.expansions.upsert(source.id, {
      sourceHash: source.contentHash,
      model,
      fr: summary.fr,
      ar: summary.ar,
    });
    result.sources.push(expanded(source, summary.fr, summary.ar));
    result.generated += 1;
  }
  return result;
};

export const expansionMockHandler: MockToolHandler = request => {
  const text = request.system.map(block => block.text).join('\n');
  const title = /"text":"([^"\\]{1,80})/.exec(text)?.[1] ?? 'livre';
  return { fr: `Résumé : ${title}.`, ar: `ملخص: ${title}.` } satisfies ExpansionModelOutput;
};
