import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/testing/**',
        'src/providers/anthropic.ts',
        'src/providers/bedrock.ts',
        'src/providers/embeddings/bedrockTitan.ts',
        'src/providers/embeddings/local.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 80 },
    },
  },
});
