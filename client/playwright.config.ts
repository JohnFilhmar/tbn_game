import { defineConfig, devices } from '@playwright/test';
import { APP_URL } from './e2e/stack';

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

/**
 * The flows run one after another against one backend, as each builds on the company the one
 * before left: a provider, then a manager, then its task.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath === undefined ? {} : { executablePath },
      },
    },
  ],
});
