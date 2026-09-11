import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: './tests', testMatch: 'operations-system.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  reporter: 'list', timeout: 120_000,
  use: { baseURL: 'http://localhost:3200', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter admin exec next start -p 3200', cwd: path.resolve(__dirname, '../..'),
    url: 'http://localhost:3200/giris', reuseExistingServer: false, timeout: 120_000,
    env: { ADMIN_BETTER_AUTH_SECRET: 'phase7-admin-e2e-secret-32-characters', ADMIN_BETTER_AUTH_URL: 'http://localhost:3200', OGUN_WEB_URL: 'http://localhost:3100' },
  },
})
