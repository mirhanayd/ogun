import { defineConfig } from '@playwright/test'
import path from 'node:path'

const PORT = process.env.ADMIN_E2E_PORT ?? '3200'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-support-http.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: BASE_URL },
  webServer: {
    command: `pnpm --filter admin exec next start -p ${PORT}`,
    cwd: path.resolve(__dirname, '../..'),
    url: `${BASE_URL}/giris`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ADMIN_BETTER_AUTH_SECRET: 'phase3-admin-http-smoke-secret-32-characters',
      ADMIN_BETTER_AUTH_URL: BASE_URL,
      OGUN_WEB_URL: 'http://localhost:3100',
    },
  },
})
