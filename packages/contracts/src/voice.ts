import { z } from 'zod';
import { ChatLocale, Citation, PendingAction } from './ai.js';

export const VOICE_INPUT_SAMPLE_RATE = 16_000;
export const VOICE_OUTPUT_SAMPLE_RATE = 24_000;
export const VOICE_FRAME_BYTES = 1024;
export const VOICE_MAX_TEXT_FRAME_BYTES = 8 * 1024;

export const VOICE_CLOSE = {
  normal: 1000,
  unauthenticated: 4401,
  forbidden: 4403,
  sessionActive: 4409,
  rateLimited: 4429,
  busy: 4503,
  invalidMessage: 4400,
} as const;

export const VoiceClientMessage = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
    locale: ChatLocale.default(ChatLocale.enum.en),
    greet: z.boolean().default(false),
  }),
  z.strictObject({ type: z.literal('stop') }),
]);
export type VoiceClientMessage = z.infer<typeof VoiceClientMessage>;

export const VoiceEndReason = z.enum([
  'user',
  'max-duration',
  'idle',
  'daily-budget',
  'provider',
  'error',
]);
export type VoiceEndReason = z.infer<typeof VoiceEndReason>;

export const VoiceServerMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    sessionId: z.string(),
    maxSeconds: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('transcript'),
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    stage: z.enum(['speculative', 'final']),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool'),
    id: z.string(),
    name: z.string(),
    status: z.enum(['running', 'done', 'error']),
  }),
  z.object({ type: z.literal('citations'), citations: z.array(Citation) }),
  z.object({ type: z.literal('pending-action'), action: PendingAction }),
  z.object({
    type: z.literal('action-decided'),
    actionId: z.string(),
    status: z.enum(['confirmed', 'cancelled']),
  }),
  z.object({ type: z.literal('interrupted') }),
  z.object({ type: z.literal('ended'), reason: VoiceEndReason }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type VoiceServerMessage = z.infer<typeof VoiceServerMessage>;
