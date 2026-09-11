import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { requireLocalE2eDatabase } from './database-safety'

requireLocalE2eDatabase()

const root = path.resolve(__dirname, '../..')

export default defineConfig({
  testDir: './tests',
  testMatch: 'food-catalog-flow.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter admin exec next start -p 3200',
      cwd: root,
      url: 'http://localhost:3200/giris',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ADMIN_BETTER_AUTH_SECRET: 'phase5-admin-e2e-secret-32-characters',
        ADMIN_BETTER_AUTH_URL: 'http://localhost:3200',
        OGUN_WEB_URL: 'http://localhost:3100',
      },
    },
    {
      command: 'pnpm --filter web exec next start -p 3100',
      cwd: root,
      url: 'http://localhost:3100/giris',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BETTER_AUTH_SECRET: 'phase5-web-e2e-secret-32-characters',
        BETTER_AUTH_URL: 'http://localhost:3100',
        NEXT_PUBLIC_BETTER_AUTH_URL: 'http://localhost:3100',
      },
    },
  ],
})
