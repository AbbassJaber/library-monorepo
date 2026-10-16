import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useAiStatus } from './queries';
import { AiProviderName, AiTier } from '@library/contracts';

const PROVIDER_LABEL: Record<string, string> = {
  bedrock: 'Bedrock',
  anthropic: 'Anthropic',
  kimi: 'Kimi',
  'openai-compatible': 'OpenAI-compatible',
};

const CLAUDE_ID = /claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/i;

export const shortModelName = (model: string): string => {
  const claude = CLAUDE_ID.exec(model);
  if (claude) {
    const [, family = '', major = '', minor] = claude;
    const name = family.charAt(0).toUpperCase() + family.slice(1);
    return minor ? `${name} ${major}.${minor}` : `${name} ${major}`;
  }
  return model;
};

export const AiStatusBadge = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const status = useAiStatus();
  if (!status.data) return null;
  const { tiers, embeddings } = status.data;
  const offline =
    tiers.small.provider === AiProviderName.enum.mock &&
    tiers.strong.provider === AiProviderName.enum.mock;
  const name = (provider: string) =>
    provider === AiProviderName.enum.mock
      ? t('ai.offline')
      : (PROVIDER_LABEL[provider] ?? provider);
  const label = offline
    ? t('ai.offlineLabel')
    : tiers.small.provider === tiers.strong.provider
      ? name(tiers.small.provider)
      : `${name(tiers.small.provider)} + ${name(tiers.strong.provider)}`;
  const tierLine = (tier: 'small' | 'strong') =>
    `${t(`ai.${tier}`)}: ${name(tiers[tier].provider)} ${tiers[tier].model} (${
      tiers[tier].cachingSupported ? t('ai.cachingOn') : t('ai.cachingOff')
    })`;
  const detail = [
    tierLine(AiTier.enum.small),
    tierLine(AiTier.enum.strong),
    `${t('ai.embeddings')}: ${embeddings.provider} (${embeddings.dimensions ?? '?'})`,
  ].join(' · ');
  const chat = tiers[status.data.chat.tier];
  const line =
    chat.provider === AiProviderName.enum.mock
      ? t('ai.statusOffline')
      : t('ai.statusLine', { provider: name(chat.provider), model: shortModelName(chat.model) });
  return (
    <span
      className={cn('inline-flex min-h-11 items-center gap-2 text-meta text-fg-3', className)}
      title={detail}
      aria-label={`${t('ai.labelPrefix', { label })}. ${detail}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          chat.provider === AiProviderName.enum.mock ? 'bg-fg-3' : 'bg-success'
        )}
      />
      <span className="truncate">{line}</span>
    </span>
  );
};
