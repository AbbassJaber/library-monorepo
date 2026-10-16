import { describe, expect, it } from 'vitest';
import { selectEmbeddingProvider } from '../select.js';
import { createBedrockCohereProvider, isCohereEmbedModel } from './bedrockCohere.js';

const fakeClient = (shape: 'v4' | 'v3', dims: number) => {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    send: async (input: { modelId: string; body: string }) => {
      const body = JSON.parse(input.body) as { texts: string[] };
      bodies.push({ modelId: input.modelId, ...body });
      const vectors = body.texts.map((_, i) =>
        Array.from({ length: dims }, (_, j) => (j === i % dims ? 1 : 0))
      );
      const payload = shape === 'v4' ? { embeddings: { float: vectors } } : { embeddings: vectors };
      return { body: new TextEncoder().encode(JSON.stringify(payload)) };
    },
  };
};

describe('Cohere embeddings on Bedrock', () => {
  it('v4: asks for float vectors at the configured size, as documents or as a query', async () => {
    const client = fakeClient('v4', 1024);
    const provider = createBedrockCohereProvider({
      region: 'eu-central-1',
      model: 'eu.cohere.embed-v4:0',
      dimensions: 1024,
      client,
    });
    const docs = await provider.embed(['a', 'b'], undefined, { purpose: 'document' });
    const query = await provider.embed(['q'], undefined, { purpose: 'query' });
    expect(docs.vectors).toHaveLength(2);
    expect(docs.vectors[0]).toHaveLength(1024);
    expect(docs.tokens).toBeGreaterThan(0);
    expect(client.bodies[0]).toMatchObject({
      modelId: 'eu.cohere.embed-v4:0',
      input_type: 'search_document',
      embedding_types: ['float'],
      output_dimension: 1024,
    });
    expect(client.bodies[1]).toMatchObject({ input_type: 'search_query' });
    expect(query.vectors).toHaveLength(1);
  });

  it('v3 multilingual: the older body and response shape, 1024 dimensions only', async () => {
    const client = fakeClient('v3', 1024);
    const provider = createBedrockCohereProvider({
      region: 'eu-central-1',
      model: 'cohere.embed-multilingual-v3',
      dimensions: 1024,
      client,
    });
    const { vectors } = await provider.embed(['x']);
    expect(vectors[0]).toHaveLength(1024);
    expect(client.bodies[0]).toEqual({
      modelId: 'cohere.embed-multilingual-v3',
      texts: ['x'],
      input_type: 'search_document',
      truncate: 'END',
    });
    expect(() =>
      createBedrockCohereProvider({
        region: 'r',
        model: 'cohere.embed-multilingual-v3',
        dimensions: 512,
      })
    ).toThrow(/1024/);
  });

  it('splits more than 96 texts into several calls, in order', async () => {
    const client = fakeClient('v4', 256);
    const provider = createBedrockCohereProvider({
      region: 'r',
      model: 'eu.cohere.embed-v4:0',
      dimensions: 256,
      client,
    });
    const { vectors } = await provider.embed(Array.from({ length: 100 }, (_, i) => `t${i}`));
    expect(vectors).toHaveLength(100);
    expect(client.bodies.map(b => (b['texts'] as string[]).length)).toEqual([96, 4]);
  });

  it('is chosen by EMBEDDING_MODEL under EMBEDDING_PROVIDER=bedrock', () => {
    expect(isCohereEmbedModel('eu.cohere.embed-v4:0')).toBe(true);
    expect(isCohereEmbedModel('cohere.embed-multilingual-v3')).toBe(true);
    expect(isCohereEmbedModel('amazon.titan-embed-text-v2:0')).toBe(false);
    const cohere = selectEmbeddingProvider({
      EMBEDDING_PROVIDER: 'bedrock',
      EMBEDDING_MODEL: 'eu.cohere.embed-v4:0',
      EMBEDDING_DIMENSIONS: 1024,
      AWS_REGION: 'eu-central-1',
    });
    expect(cohere).toMatchObject({
      name: 'bedrock',
      model: 'eu.cohere.embed-v4:0',
      dimensions: 1024,
    });
  });
});
