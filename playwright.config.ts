import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
