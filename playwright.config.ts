import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:4173',
    acceptDownloads: true
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    env: {
      VITE_FAST_CRYPTO: 'true'
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'msedge', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['iPhone 12'] } }
  ]
});
