import type { z } from 'zod';
import type { GenerateRequest, GenerateResult, LlmProvider } from '../providers/types.js';

export interface ValidatedOk<T> {
  ok: true;
  value: T;
  attempts: GenerateResult[];
}
export interface ValidatedFail {
  ok: false;
  attempts: GenerateResult[];
  issues: string[];
}
export type Validated<T> = ValidatedOk<T> | ValidatedFail;

export const generateValidated = async <T>(
  llm: LlmProvider,
  request: Omit<GenerateRequest, 'tools' | 'toolChoice'>,
  tool: { name: string; description: string; schema: z.ZodType<T> },
  toJsonSchema: (schema: z.ZodType<T>) => Record<string, unknown>
): Promise<Validated<T>> => {
  const attempts: GenerateResult[] = [];
  let messages = request.messages;
  let issues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await llm.generate({
      ...request,
      messages,
      tools: [
        { name: tool.name, description: tool.description, inputSchema: toJsonSchema(tool.schema) },
      ],
      toolChoice: { type: 'tool', name: tool.name },
    });
    attempts.push(result);
    const call = result.toolCalls.find(c => c.name === tool.name);
    const parsed = call ? tool.schema.safeParse(call.input) : null;
    if (parsed?.success) return { ok: true, value: parsed.data, attempts };
    issues = parsed
      ? parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      : [`no ${tool.name} tool call in the response`];
    messages = [
      ...messages,
      {
        role: 'assistant',
        content: call
          ? [{ type: 'tool_use', id: call.id, name: call.name, input: call.input }]
          : result.text || '(no answer)',
      },
      {
        role: 'user',
        content: call
          ? [
              {
                type: 'tool_result',
                toolUseId: call.id,
                content: `Invalid input: ${issues.join('; ')}. Call ${tool.name} again with corrected input.`,
                isError: true,
              },
            ]
          : `Your answer was not a ${tool.name} tool call. Call ${tool.name} with valid input.`,
      },
    ];
  }
  return { ok: false, attempts, issues };
};
