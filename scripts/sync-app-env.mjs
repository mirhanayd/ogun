#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const APP_ENV_ALLOWLISTS = {
  web: [
    'APP_ENV', 'DATABASE_URL', 'DATABASE_POOL_MAX', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL',
    'NEXT_PUBLIC_BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_PILOT_CONTACT_EMAIL',
    'OGUN_WEB_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY',
    'RESEND_FROM_EMAIL', 'S3_ENDPOINT', 'S3_REGION', 'S3_FORCE_PATH_STYLE', 'S3_BUCKET',
    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN',
    'SENTRY_ENVIRONMENT', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN', 'LOG_LEVEL',
    'CRON_SECRET', 'OPERATIONAL_JOBS_ENABLED', 'EXTERNAL_DELIVERY_ENABLED',
    'PILOT_METRICS_ACCESS_EMAILS', 'CLINICAL_REVIEW_ENABLED', 'BLOB_READ_WRITE_TOKEN',
    'PAYMENTS_MODE', 'IYZICO_API_KEY', 'IYZICO_SECRET_KEY', 'IYZICO_BASE_URL',
    'IYZICO_PRODUCT_REFERENCE_CODE', 'IYZICO_SINGLE_MONTHLY_PLAN_REFERENCE_CODE',
    'IYZICO_SINGLE_YEARLY_PLAN_REFERENCE_CODE', 'IYZICO_TEAM_MONTHLY_PLAN_REFERENCE_CODE',
    'IYZICO_TEAM_YEARLY_PLAN_REFERENCE_CODE', 'STANDALONE_BUILD',
  ],
  admin: [
    'APP_ENV', 'DATABASE_URL', 'DATABASE_POOL_MAX', 'ADMIN_BETTER_AUTH_SECRET',
    'ADMIN_BETTER_AUTH_URL', 'OGUN_WEB_URL', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL',
    'CLINICAL_REVIEW_INVITATION_CAPTURE_PATH', 'LOG_LEVEL', 'SENTRY_DSN',
    'SENTRY_ENVIRONMENT', 'SENTRY_ORG', 'SENTRY_PROJECT', 'SENTRY_AUTH_TOKEN',
  ],
}

function parseEnvLines(contents) {
  const values = new Map()
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (match) values.set(match[1], match[2])
  }
  return values
}

export function syncAppEnvironment(app, options = {}) {
  const allowlist = APP_ENV_ALLOWLISTS[app]
  if (!allowlist) throw new Error(`Unknown app environment target: ${app}`)
  const source = options.source ?? resolve(repoRoot, '.env')
  const target = options.target ?? resolve(repoRoot, `apps/${app}/.env.local`)
  if (!existsSync(source)) return { status: 'missing', count: 0, target }
  const values = parseEnvLines(readFileSync(source, 'utf8'))
  const selected = allowlist.filter((key) => values.has(key)).map((key) => `${key}=${values.get(key)}`)
  writeFileSync(target, `${selected.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  return { status: 'written', count: selected.length, target }
}

export function runSyncCli(app) {
  const result = syncAppEnvironment(app)
  console.log(result.status === 'missing'
    ? `[sync-${app}-env] Root .env not found; deployment-injected variables remain unchanged.`
    : `[sync-${app}-env] ${result.count} allowlisted variables synchronized.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runSyncCli(process.argv[2])
