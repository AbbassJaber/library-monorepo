import type { GenerateRequest, LlmProvider, TierInfo } from './types.js';
import { AiTier } from '@library/contracts';

export const createTieredProvider = (providers: {
  small: LlmProvider;
  strong: LlmProvider;
}): LlmProvider => {
  const tier = (which: 'small' | 'strong'): TierInfo => {
    const provider = providers[which];
    return {
      provider: provider.name,
      model: provider.models[which],
      supportsPromptCaching: provider.supportsPromptCaching,
      forcedToolChoice: provider.forcedToolChoice,
    };
  };
  return {
    name: providers.small.name,
    get models() {
      return { small: providers.small.models.small, strong: providers.strong.models.strong };
    },
    get supportsPromptCaching() {
      return providers.small.supportsPromptCaching;
    },
    get forcedToolChoice() {
      return providers.small.forcedToolChoice;
    },
    get tiers() {
      return { small: tier(AiTier.enum.small), strong: tier(AiTier.enum.strong) };
    },
    generate: (request: GenerateRequest) => providers[request.tier].generate(request),
  };
};
