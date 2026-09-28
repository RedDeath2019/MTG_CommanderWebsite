import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:5183',
    browserName: 'chromium',
    headless: true,
  },
})
