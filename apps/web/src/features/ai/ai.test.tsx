import { screen } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { setLocale } from '@/i18n';
import { aiStatus } from '@/test/fixtures';
import { API, error, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { AiFallbackNotice } from './AiFallbackNotice';
import { AiStatusBadge } from './AiStatusBadge';
import { aiMetaOf, isAiUnavailable } from './api';
import { ApiErrorCode } from '@library/contracts';
import { UI_LOCALE } from '@library/domain-config';

describe('AiStatusBadge', () => {
  it('says "offline mode" without keys, with the configured ids in the accessible description', async () => {
    renderWithProviders(<AiStatusBadge />);
    const badge = await screen.findByLabelText(/AI: offline mode \(no provider configured\)/);
    expect(badge).toHaveTextContent('AI · offline mode');
    expect(badge).not.toHaveTextContent('Mock');
    expect(badge.getAttribute('aria-label')).toContain('mock-small');
    expect(badge.getAttribute('aria-label')).toContain('embeddings: mock (384)');
    expect(badge.getAttribute('aria-label')).toContain(
      'small: offline mode mock-small (no prompt caching)'
    );
  });

  it('says it in French too', async () => {
    await setLocale(UI_LOCALE.fr);
    try {
      renderWithProviders(<AiStatusBadge />);
      expect(
        await screen.findByLabelText(/^IA : mode hors ligne \(aucun fournisseur configuré\)/)
      ).toHaveTextContent('IA · mode hors ligne');
    } finally {
      await setLocale(UI_LOCALE.en);
    }
  });

  it('names each tier’s provider and model exactly as configured (Haiku small, Kimi strong)', async () => {
    server.use(
      http.get(`${API}/ai/status`, () =>
        ok({
          ...aiStatus,
          provider: 'bedrock',
          models: { small: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', strong: 'kimi-k3' },
          cachingSupported: true,
          tiers: {
            small: {
              provider: 'bedrock',
              model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
              cachingSupported: true,
              forcedToolChoice: 'forced',
            },
            strong: {
              provider: 'kimi',
              model: 'kimi-k3',
              cachingSupported: true,
              forcedToolChoice: 'auto-with-instruction',
            },
          },
        })
      )
    );
    renderWithProviders(<AiStatusBadge />);
    const badge = await screen.findByLabelText(/AI: Bedrock \+ Kimi/);
    expect(badge).toHaveTextContent('AI · Bedrock · Haiku 4.5');
    expect(badge.getAttribute('aria-label')).toContain(
      'small: Bedrock eu.anthropic.claude-haiku-4-5-20251001-v1:0 (prompt caching on)'
    );
    expect(badge.getAttribute('aria-label')).toContain('strong: Kimi kimi-k3 (prompt caching on)');
  });

  it('renders nothing while the status is unknown or failing', () => {
    server.use(http.get(`${API}/ai/status`, () => error(500, 'INTERNAL')));
    const { container } = renderWithProviders(<AiStatusBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AI responses and fallbacks', () => {
  it('reads meta.ai when present and recognises AI_UNAVAILABLE as the fallback signal', () => {
    const meta = {
      runId: 1,
      feature: 'NL_SEARCH',
      provider: 'mock',
      model: 'mock-small',
      tokensIn: 10,
      tokensOut: 2,
      tokensCachedRead: 0,
      tokensCachedWrite: 0,
      costUsd: 0,
      latencyMs: 5,
      fallbackUsed: false,
    };
    expect(aiMetaOf({ data: null, meta: { ai: meta } })).toEqual(meta);
    expect(aiMetaOf({ data: null })).toBeNull();
    expect(
      isAiUnavailable(
        new ApiError(503, { code: ApiErrorCode.enum.AI_UNAVAILABLE, message: 'down' })
      )
    ).toBe(true);
    expect(
      isAiUnavailable(new ApiError(500, { code: ApiErrorCode.enum.INTERNAL, message: 'x' }))
    ).toBe(false);
  });

  it('the fallback notice is a polite status message', () => {
    renderWithProviders(<AiFallbackNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(/unavailable/);
  });
});

describe('shortModelName', () => {
  it('shortens Claude ids from any provider and leaves other ids as they are', async () => {
    const { shortModelName } = await import('./AiStatusBadge');
    expect(shortModelName('eu.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('Haiku 4.5');
    expect(shortModelName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(shortModelName('claude-sonnet-4-20250514')).toBe('Sonnet 4');
    expect(shortModelName('kimi-k3')).toBe('kimi-k3');
  });
});
