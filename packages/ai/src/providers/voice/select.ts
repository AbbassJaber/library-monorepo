import { AiConfigError } from '../select.js';
import { createMockVoiceProvider } from './mock.js';
import { createNovaSonicProvider } from './novaSonic.js';
import type { VoiceProvider } from './types.js';
import { VoiceProviderSetting } from '@library/contracts';

export interface VoiceEnv {
  VOICE_PROVIDER?: string | undefined;
  VOICE_MODEL?: string | undefined;
  VOICE_AWS_REGION?: string | undefined;
}

export const selectVoiceProvider = (env: VoiceEnv): VoiceProvider | null => {
  const off = VoiceProviderSetting.enum.off;
  const name = (env.VOICE_PROVIDER ?? off).trim() || off;
  if (name === off) return null;
  if (name === VoiceProviderSetting.enum.mock) return createMockVoiceProvider();
  if (name === VoiceProviderSetting.enum['nova-sonic']) {
    const model = env.VOICE_MODEL?.trim();
    if (!model)
      throw new AiConfigError(
        'VOICE_PROVIDER=nova-sonic needs VOICE_MODEL (see apps/api/.env.example)'
      );
    return createNovaSonicProvider({ region: env.VOICE_AWS_REGION?.trim() || 'eu-north-1', model });
  }
  throw new AiConfigError(`VOICE_PROVIDER must be off|mock|nova-sonic, got "${name}"`);
};
