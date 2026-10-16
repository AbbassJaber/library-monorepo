import { createHttpClient } from '@library/ai';
import { describe, expect, it } from 'vitest';
import { runRetrievalHybridHttp } from './retrieval.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('retrieval over hybrid search', () => {
  it('asks /ai/search for the top 5 with the rerank flag, and keeps cost, latency and fallback per query', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async input => {
      const url = String(input);
      if (url.endsWith('/auth/login')) return json({ data: { accessToken: 't' } });
      urls.push(url);
      return json({
        data: {
          items: [12, 3].map(id => ({
            book: { id },
            scores: { lexical: null, semantic: 0.7, fused: 0.01 },
          })),
          reranked: true,
        },
        meta: {
          rerank: 'applied',
          ai: {
            runId: 1,
            feature: 'HYBRID_SEARCH',
            provider: 'bedrock',
            model: 'haiku',
            tokensIn: 1200,
            tokensOut: 30,
            tokensCachedRead: 0,
            tokensCachedWrite: 0,
            costUsd: 0.0014,
            latencyMs: 900,
            fallbackUsed: false,
          },
        },
      });
    };
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r',
      password: 'p',
      fetch: fetchImpl,
    });
    const [row] = await runRetrievalHybridHttp(
      [
        {
          id: 'r-17',
          query: 'desert planet with giant worms',
          expected: [12],
          kind: 'description',
        },
      ],
      client,
      true
    );
    expect(urls[0]).toBe(
      'http://api.test/api/v1/ai/search?q=desert+planet+with+giant+worms&limit=5&rerank=true'
    );
    expect(row).toMatchObject({
      mode: 'rerank',
      top: [12, 3],
      recall: 1,
      costUsd: 0.0014,
      modelLatencyMs: 900,
      reranked: true,
      rerankStatus: 'applied',
      rank: 1,
      throttleRetries: 0,
      fallbackUsed: false,
      error: null,
    });
  });

  it('retries a rerank the provider could not answer (quota), and counts the retries', async () => {
    let searches = 0;
    const fetchImpl: typeof fetch = async input => {
      if (String(input).endsWith('/auth/login')) return json({ data: { accessToken: 't' } });
      searches += 1;
      const applied = searches > 1;
      return json({
        data: { items: [{ book: { id: 3 } }, { book: { id: 12 } }], reranked: applied },
        meta: { rerank: applied ? 'applied' : 'unavailable' },
      });
    };
    const client = createHttpClient({
      baseUrl: 'http://api.test',
      email: 'r',
      password: 'p',
      fetch: fetchImpl,
    });
    const [row] = await runRetrievalHybridHttp(
      [{ id: 'r-15', query: 'a boy wizard', expected: [12], kind: 'description' }],
      client,
      true,
      { throttleRetries: 2, backoffMs: 60 }
    );
    expect(searches).toBe(2);
    expect(row!.latencyMs).toBeLessThan(60);
    expect(row).toMatchObject({ rerankStatus: 'applied', throttleRetries: 1, rank: 2, recall: 1 });
  });
});
