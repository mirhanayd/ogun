import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { requireLocalE2eDatabase } from './database-safety'

requireLocalE2eDatabase()

const root = path.resolve(__dirname, '../..')
const capture = path.resolve(__dirname, 'fixtures/.clinical-review-invite.json')
export default defineConfig({
  testDir: './tests',
  testMatch: 'clinical-reviewer-flow.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
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
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ADMIN_BETTER_AUTH_SECRET: 'phase4-admin-e2e-secret-32-characters',
        ADMIN_BETTER_AUTH_URL: 'http://localhost:3200',
        OGUN_WEB_URL: 'http://localhost:3100',
        CLINICAL_REVIEW_INVITATION_CAPTURE_PATH: capture,
      },
    },
    {
      command: 'pnpm --filter web exec next start -p 3100',
      cwd: root,
      url: 'http://localhost:3100/giris',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        BETTER_AUTH_SECRET: 'phase4-web-e2e-secret-32-characters',
        BETTER_AUTH_URL: 'http://localhost:3100',
        NEXT_PUBLIC_BETTER_AUTH_URL: 'http://localhost:3100',
        CLINICAL_REVIEW_ENABLED: 'true',
        RESEND_API_KEY: '',
        RESEND_FROM_EMAIL: '',
      },
    },
  ],
})
