import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { requireLocalE2eDatabase } from './database-safety'

requireLocalE2eDatabase()

const WEB_PORT = process.env.SECURITY_WEB_PORT ?? '3300'
const ADMIN_PORT = process.env.SECURITY_ADMIN_PORT ?? '3301'
const WEB_URL = `http://localhost:${WEB_PORT}`
const ADMIN_URL = `http://localhost:${ADMIN_PORT}`

export default defineConfig({
  testDir: './tests',
  testMatch: 'security-release.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm --filter web exec next start -p ${WEB_PORT}`,
      cwd: path.resolve(__dirname, '../..'),
      url: `${WEB_URL}/giris`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BETTER_AUTH_SECRET: 'phase8-web-security-smoke-secret-32-characters',
        BETTER_AUTH_URL: WEB_URL,
        NEXT_PUBLIC_BETTER_AUTH_URL: WEB_URL,
        OGUN_WEB_URL: WEB_URL,
        CRON_SECRET: 'phase8-cron-security-smoke-secret-32-characters',
        RESEND_API_KEY: '',
        RESEND_FROM_EMAIL: '',
      },
    },
    {
      command: `pnpm --filter admin exec next start -p ${ADMIN_PORT}`,
      cwd: path.resolve(__dirname, '../..'),
      url: `${ADMIN_URL}/giris`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ADMIN_BETTER_AUTH_SECRET: 'phase8-admin-security-smoke-secret-32-characters',
        ADMIN_BETTER_AUTH_URL: ADMIN_URL,
        OGUN_WEB_URL: WEB_URL,
      },
    },
  ],
})
