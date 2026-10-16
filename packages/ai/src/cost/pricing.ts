export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

const claude = (input: number, output: number, regionalPremium = 1): ModelPrice => ({
  inputPerMTok: input * regionalPremium,
  outputPerMTok: output * regionalPremium,
  cacheReadPerMTok: input * 0.1 * regionalPremium,
  cacheWritePerMTok: input * 1.25 * regionalPremium,
});

export const PRICING: Record<string, ModelPrice> = {
  'claude-haiku-4-5-20251001': claude(1, 5),
  'claude-haiku-4-5': claude(1, 5),
  'claude-sonnet-5-5': claude(2, 10),
  'claude-sonnet-5': claude(2, 10),
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': claude(1, 5),
  'eu.anthropic.claude-haiku-4-5-20251001-v1:0': claude(1, 5, 1.1),
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': claude(1, 5, 1.1),
  'global.anthropic.claude-sonnet-5-5': claude(2, 10),
  'eu.anthropic.claude-sonnet-5-5': claude(2, 10, 1.1),
  'us.anthropic.claude-sonnet-5-5': claude(2, 10, 1.1),
  'eu.cohere.embed-v4:0': {
    inputPerMTok: 0.12,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  },
  'cohere.embed-multilingual-v3': {
    inputPerMTok: 0.1,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  },
  'amazon.titan-embed-text-v2:0': {
    inputPerMTok: 0.02,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  },
  'kimi-k3': { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3 },
  'kimi-k2.6': {
    inputPerMTok: 0.95,
    outputPerMTok: 4,
    cacheReadPerMTok: 0.16,
    cacheWritePerMTok: 0.95,
  },
  'mock-small': { inputPerMTok: 0, outputPerMTok: 0, cacheReadPerMTok: 0, cacheWritePerMTok: 0 },
  'mock-strong': { inputPerMTok: 0, outputPerMTok: 0, cacheReadPerMTok: 0, cacheWritePerMTok: 0 },
  'mock-embedding': {
    inputPerMTok: 0,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  },
  'Xenova/bge-small-en-v1.5': {
    inputPerMTok: 0,
    outputPerMTok: 0,
    cacheReadPerMTok: 0,
    cacheWritePerMTok: 0,
  },
};

export const priceFor = (model: string): { price: ModelPrice; known: boolean } => {
  const price = PRICING[model];
  return price
    ? { price, known: true }
    : {
        price: { inputPerMTok: 0, outputPerMTok: 0, cacheReadPerMTok: 0, cacheWritePerMTok: 0 },
        known: false,
      };
};

export interface VoicePrice {
  speechInPerMTok: number;
  speechOutPerMTok: number;
  textInPerMTok: number;
  textOutPerMTok: number;
}

export const VOICE_PRICING: Record<string, VoicePrice> = {
  'amazon.nova-2-sonic-v1:0': {
    speechInPerMTok: 2.91,
    speechOutPerMTok: 11.65,
    textInPerMTok: 0.363,
    textOutPerMTok: 2.992,
  },
  'mock-voice': { speechInPerMTok: 0, speechOutPerMTok: 0, textInPerMTok: 0, textOutPerMTok: 0 },
};

export const VOICE_TOKENS_PER_SECOND = { speechIn: 9.5, speechOut: 25 } as const;

export const voiceCostUsd = (
  model: string,
  usage: { speechIn: number; speechOut: number; textIn: number; textOut: number }
): number => {
  const price = VOICE_PRICING[model];
  if (!price) return 0;
  return (
    (usage.speechIn * price.speechInPerMTok +
      usage.speechOut * price.speechOutPerMTok +
      usage.textIn * price.textInPerMTok +
      usage.textOut * price.textOutPerMTok) /
    1_000_000
  );
};
