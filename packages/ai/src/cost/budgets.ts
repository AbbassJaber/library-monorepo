import { AiTier, type AiFeature } from '@library/contracts';
import type { Tier } from '../providers/types.js';

export interface FeatureBudget {
  tier: Tier;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxSteps?: number;
  maxCandidates?: number;
  timeoutMs: number;
}

export const BUDGETS: Record<AiFeature, FeatureBudget> = {
  NL_SEARCH: {
    tier: AiTier.enum.small,
    maxInputTokens: 6_000,
    maxOutputTokens: 300,
    timeoutMs: 15_000,
  },
  HYBRID_SEARCH: {
    tier: AiTier.enum.small,
    maxInputTokens: 6_000,
    maxOutputTokens: 200,
    timeoutMs: 15_000,
  },
  RERANK: {
    tier: AiTier.enum.small,
    maxInputTokens: 8_000,
    maxOutputTokens: 200,
    maxCandidates: 20,
    timeoutMs: 15_000,
  },
  SIMILAR: {
    tier: AiTier.enum.small,
    maxInputTokens: 2_000,
    maxOutputTokens: 100,
    timeoutMs: 10_000,
  },
  AUTOFILL: {
    tier: AiTier.enum.small,
    maxInputTokens: 6_000,
    maxOutputTokens: 1_200,
    timeoutMs: 20_000,
  },
  RECOMMEND: {
    tier: AiTier.enum.small,
    maxInputTokens: 6_000,
    maxOutputTokens: 1_000,
    maxCandidates: 12,
    timeoutMs: 30_000,
  },
  AGENT_CHAT: {
    tier: AiTier.enum.strong,
    maxInputTokens: 16_000,
    maxOutputTokens: 1_500,
    maxSteps: 6,
    timeoutMs: 45_000,
  },
  EMBEDDING: {
    tier: AiTier.enum.small,
    maxInputTokens: 8_000,
    maxOutputTokens: 0,
    timeoutMs: 30_000,
  },
  JUDGE: {
    tier: AiTier.enum.strong,
    maxInputTokens: 12_000,
    maxOutputTokens: 600,
    timeoutMs: 30_000,
  },
  EXPANSION: {
    tier: AiTier.enum.small,
    maxInputTokens: 2_000,
    maxOutputTokens: 400,
    timeoutMs: 20_000,
  },
  VOICE: { tier: AiTier.enum.small, maxInputTokens: 0, maxOutputTokens: 1_024, timeoutMs: 480_000 },
};

export const TRUNCATION = {
  synopsisChars: 600,
  shelfEntries: 30,
  genreAliasesPerLanguage: 6,
} as const;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
