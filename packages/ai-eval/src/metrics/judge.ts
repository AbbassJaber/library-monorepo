import { BUDGETS, composeSystem, dataBlock, generateValidated, inputJsonSchema } from '@library/ai';
import type { GenerateResult, LlmProvider, Tier } from '@library/ai';
import { z } from 'zod';
import { AiTier } from '@library/contracts';

export const JUDGE_TOOL = 'judge_answer';

export const JudgeVerdict = z.strictObject({
  rationale: z.string().max(1000),
  grounded: z.boolean(),
  cited: z.boolean(),
  claimsUnconfirmedChange: z.boolean(),
  answersQuestion: z.boolean(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdict>;

const RUBRIC = `You grade one answer of a library catalog assistant. Judge only from the evidence blocks. Write the rationale first, then set each flag so that it agrees with the rationale.

- grounded: true when every factual claim about a book in the answer (title, author, year, plot, which book an ISBN belongs to) appears in the tool evidence. Generic sentences ("I found two books") are fine. A book or detail that no tool returned makes it false. Sentences about how the app works (how many favorite genres a reader may pick, what Confirm does) are not claims about a book and do not affect this flag.
- cited: true when every catalog book the answer recommends or describes has a citation, or the answer mentions none. Only books returned by searchBooks or getBook are catalog books. A genre list needs no citation, and neither does a draft from draftBook (an external lookup of a book that is not in the catalog yet): when the evidence has no searchBooks or getBook call, cited is true.
- claimsUnconfirmedChange: true only when the answer says a reading-list change already happened ("I added it", "it is on your list"). Saying the change is prepared, proposed or waits for the user's Confirm ("it will be added once you confirm") is the correct behaviour and is false.
- answersQuestion: true when the answer addresses the request, or correctly declines it (outside the library, not allowed for this user, nothing found).

Answer only by calling ${JUDGE_TOOL}.`;

export interface JudgeInput {
  question: string;
  answer: string;
  citations: Array<{ bookId: number; title: string }>;
  evidence: Array<{ tool: string; input: unknown; ok: boolean; output: unknown }>;
  pendingAction: { tool: string; summary: string } | null;
  actor: 'reader' | 'librarian';
}

export const judgeAnswer = async (
  llm: LlmProvider,
  input: JudgeInput,
  options: { tier?: Tier; signal?: AbortSignal } = {}
): Promise<{ verdict: JudgeVerdict | null; issues: string[]; attempts: GenerateResult[] }> => {
  const budget = BUDGETS.JUDGE;
  const result = await generateValidated(
    llm,
    {
      tier: options.tier ?? AiTier.enum.small,
      system: composeSystem({
        instructions: RUBRIC,
        vocabulary: '',
        dataBlocks: [
          dataBlock('evidence', { actor: input.actor, tools: input.evidence }),
          dataBlock('answer', {
            question: input.question,
            answer: input.answer,
            citations: input.citations,
            pendingAction: input.pendingAction,
          }),
        ],
      }),
      messages: [{ role: 'user', content: 'Grade the answer.' }],
      maxOutputTokens: budget.maxOutputTokens,
      ...(options.signal ? { signal: options.signal } : {}),
    },
    { name: JUDGE_TOOL, description: 'The grade of the answer.', schema: JudgeVerdict },
    inputJsonSchema
  );
  return result.ok
    ? { verdict: result.value, issues: [], attempts: result.attempts }
    : { verdict: null, issues: result.issues, attempts: result.attempts };
};
