import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/smoke/**/*.smoke.ts'],
    globalSetup: ['src/smoke/ready.globalSetup.ts'],
    setupFiles: ['src/smoke/smoke.setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
