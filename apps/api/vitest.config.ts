import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    setupFiles: ['src/test/setup.ts'],
    fileParallelism: false,
    env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/ai/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { statements: 80 },
    },
  },
});
