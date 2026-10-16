import { useState } from 'react';
import type { AiMeta } from '@library/contracts';
import { useFormat } from '@/i18n/format';

export const useAiMeta = () => {
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const format = useFormat();
  const line =
    meta === null
      ? null
      : `${meta.model} · ${meta.latencyMs} ms · $${meta.costUsd.toFixed(5)}${meta.tokensCachedRead > 0 ? ` · ${format.integer(meta.tokensCachedRead)} cached` : ''}${meta.fallbackUsed ? ' · fallback' : ''}`;
  return { meta, setMeta, line };
};
