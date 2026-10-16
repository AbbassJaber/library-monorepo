import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL } from './e2e/config';

const channel =
  process.env['PLAYWRIGHT_CHANNEL'] ?? (process.platform === 'darwin' ? 'chrome' : undefined);

const FAKE_MIC = fileURLToPath(
  new URL('../../packages/ai-eval/fixtures/voice/e2e-mic.wav', import.meta.url)
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
    ...(channel ? { channel } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(voice|motion|mobile)\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'motion',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'no-preference' } },
      testMatch: /motion\.spec\.ts/,
    },
    {
      name: 'voice',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${FAKE_MIC}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
      testMatch: /voice\.spec\.ts/,
    },
    {
      name: 'forced-colors',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'light',
        contextOptions: { forcedColors: 'active', reducedMotion: 'reduce' },
      },
      testMatch: /modes\.spec\.ts/,
    },
    {
      name: 'reduced-motion',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
      testMatch: /modes\.spec\.ts/,
    },
  ],
});
