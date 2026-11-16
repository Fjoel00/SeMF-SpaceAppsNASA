import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://localhost:8090',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Mobile Chromium (390x844)',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'node dist-server/index.js',
    url: 'http://localhost:8090/api/health',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
