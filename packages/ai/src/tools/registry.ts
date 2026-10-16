import { Role } from '@library/contracts';
import type { ToolName } from '@library/contracts';
import { z } from 'zod';
import type { BookSummary, SearchBooksInput } from '@library/contracts';
import type { Actor, Ports } from '../ports/index.js';
import type { ToolSpec } from '../providers/types.js';

export interface ToolContext {
  actor: Actor;
  ports: Ports;
  requestId: string | null;
  search?: (input: SearchBooksInput) => Promise<BookSummary[]>;
}

export interface ToolDefinition<I, O> {
  name: ToolName;
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  roles: Role[];
  mutates: boolean;
  run(ctx: ToolContext, input: I): Promise<O>;
}

export type ToolErrorCode = 'UNKNOWN_TOOL' | 'FORBIDDEN' | 'INVALID_INPUT' | 'INVALID_OUTPUT';

export const TOOL_ERROR_STATUS: Record<ToolErrorCode, number> = {
  UNKNOWN_TOOL: 404,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  INVALID_OUTPUT: 500,
};

export class ToolError extends Error {
  override readonly name = 'ToolError';
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }

  get status(): number {
    return TOOL_ERROR_STATUS[this.code];
  }
}

export interface ToolRegistry {
  list(actor: Actor): ToolDefinition<unknown, unknown>[];
  get(name: string): ToolDefinition<unknown, unknown> | undefined;
  prepare(
    ctx: Pick<ToolContext, 'actor'>,
    name: string,
    rawInput: unknown
  ): { tool: ToolDefinition<unknown, unknown>; input: unknown };
  call(ctx: ToolContext, name: string, rawInput: unknown): Promise<unknown>;
  specs(actor: Actor): ToolSpec[];
  toJsonSchema(name: string): Record<string, unknown>;
}

export const inputJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  delete json['$schema'];
  const ref = json['$ref'];
  const defs = json['$defs'] as Record<string, Record<string, unknown>> | undefined;
  if (typeof ref === 'string' && ref.startsWith('#/$defs/') && defs) {
    const name = ref.slice('#/$defs/'.length);
    const { [name]: root, ...rest } = defs;
    if (root) return Object.keys(rest).length > 0 ? { ...root, $defs: rest } : { ...root };
  }
  return json;
};

export const createToolRegistry = (definitions: ToolDefinition<never, unknown>[]): ToolRegistry => {
  const byName = new Map<string, ToolDefinition<unknown, unknown>>(
    definitions.map(definition => [definition.name, definition as ToolDefinition<unknown, unknown>])
  );
  const visible = (actor: Actor) =>
    [...byName.values()].filter(tool => tool.roles.includes(actor.role));
  const prepare: ToolRegistry['prepare'] = (ctx, name, rawInput) => {
    const tool = byName.get(name);
    if (!tool) throw new ToolError('UNKNOWN_TOOL', `Unknown tool "${name}"`);
    if (!tool.roles.includes(ctx.actor.role))
      throw new ToolError(
        'FORBIDDEN',
        `Tool "${name}" requires the ${tool.roles.join(' or ')} role`
      );
    const input = tool.input.safeParse(rawInput);
    if (!input.success)
      throw new ToolError('INVALID_INPUT', `Invalid input for "${name}"`, input.error.issues);
    return { tool, input: input.data };
  };
  return {
    list: visible,
    get: name => byName.get(name),
    specs: actor =>
      visible(actor).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: inputJsonSchema(tool.input),
      })),
    toJsonSchema: name => {
      const tool = byName.get(name);
      if (!tool) throw new ToolError('UNKNOWN_TOOL', `Unknown tool "${name}"`);
      return inputJsonSchema(tool.input);
    },
    prepare,
    async call(ctx, name, rawInput) {
      const { tool, input } = prepare(ctx, name, rawInput);
      const output = await tool.run(ctx, input);
      const checked = tool.output.safeParse(output);
      if (!checked.success)
        throw new ToolError(
          'INVALID_OUTPUT',
          `Tool "${name}" produced an invalid result`,
          checked.error.issues
        );
      return checked.data;
    },
  };
};

export const READER_ROLES: Role[] = [Role.enum.READER, Role.enum.LIBRARIAN];
export const LIBRARIAN_ROLES: Role[] = [Role.enum.LIBRARIAN];
