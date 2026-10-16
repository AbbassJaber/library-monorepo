import { createHash } from 'node:crypto';
import { estimateTokens } from '../../cost/budgets.js';
import type { EmbeddingProvider } from '../types.js';
import { EmbeddingProviderName } from '@library/contracts';

export const MOCK_EMBEDDING_MODEL = 'mock-embedding';

const bucket = (feature: string, dimensions: number): number =>
  createHash('sha1').update(feature).digest().readUInt32BE(0) % dimensions;

export const mockEmbed = (text: string, dimensions: number): number[] => {
  const vector = new Array<number>(dimensions).fill(0);
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length > 1);
  for (const word of words) {
    vector[bucket(`w:${word}`, dimensions)]! += 1;
    const padded = ` ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++)
      vector[bucket(`t:${padded.slice(i, i + 3)}`, dimensions)]! += 0.5;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map(value => value / norm);
};

export const createMockEmbeddingProvider = (dimensions: number): EmbeddingProvider => ({
  name: EmbeddingProviderName.enum.mock,
  model: MOCK_EMBEDDING_MODEL,
  dimensions,
  embed: async texts => ({
    vectors: texts.map(text => mockEmbed(text, dimensions)),
    tokens: texts.reduce((sum, text) => sum + estimateTokens(text), 0),
  }),
});
