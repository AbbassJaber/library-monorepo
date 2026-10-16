import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AiEnv } from '@library/ai';
import { AiProviderName } from '@library/contracts';

export const REPO_ROOT = join(import.meta.dirname, '../../..');

export const loadApiEnv = (): void => {
  const file = join(REPO_ROOT, 'apps/api/.env');
  if (existsSync(file)) process.loadEnvFile(file);
};

const PREFIX: Record<Exclude<AiProviderName, 'mock'>, string> = {
  bedrock: 'BEDROCK',
  anthropic: 'ANTHROPIC',
  kimi: 'KIMI',
  'openai-compatible': 'OPENAI_COMPAT',
};

export const envForProvider = (
  provider: AiProviderName,
  env: NodeJS.ProcessEnv = process.env
): AiEnv => {
  if (provider === AiProviderName.enum.mock) return { AI_PROVIDER: AiProviderName.enum.mock };
  const active = env['AI_PROVIDER'] === provider;
  const small =
    env[`${PREFIX[provider]}_MODEL_SMALL`] ?? (active ? env['AI_MODEL_SMALL'] : undefined);
  const strong =
    env[`${PREFIX[provider]}_MODEL_STRONG`] ??
    (active ? env['AI_MODEL_STRONG'] : undefined) ??
    small;
  if (!small)
    throw new Error(
      `--provider ${provider} needs ${PREFIX[provider]}_MODEL_SMALL (or AI_MODEL_SMALL with AI_PROVIDER=${provider})`
    );
  return {
    ...env,
    AI_PROVIDER: provider,
    AI_PROVIDER_STRONG: '',
    AI_MODEL_SMALL: small,
    AI_MODEL_STRONG: strong,
  };
};
