#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

const PLACEHOLDER_SECRET = /(change[-_ ]?me|replace[-_ ]?me|example|dummy|minioadmin)/i
const present = (env, key) => typeof env[key] === 'string' && env[key].trim().length > 0
const strongSecret = (env, key) => present(env, key) && env[key].length >= 32 && !PLACEHOLDER_SECRET.test(env[key])

function httpsUrl(env, key) {
  if (!present(env, key)) return false
  try {
    const url = new URL(env[key])
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1', 'example.com'].includes(url.hostname)
  } catch { return false }
}

function remotePostgres(env) {
  if (!present(env, 'DATABASE_URL')) return false
  try {
    const url = new URL(env.DATABASE_URL)
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      && !PLACEHOLDER_SECRET.test(url.password)
  } catch { return false }
}

export function validateProductionEnvironment(env = process.env) {
  const googleDisabled = !present(env, 'GOOGLE_CLIENT_ID') && !present(env, 'GOOGLE_CLIENT_SECRET')
  const paymentUrl = env.IYZICO_BASE_URL ?? ''
  const paymentModeMatches = env.PAYMENTS_MODE === 'sandbox'
    ? /sandbox/i.test(paymentUrl)
    : env.PAYMENTS_MODE === 'production' && httpsUrl(env, 'IYZICO_BASE_URL') && !/sandbox/i.test(paymentUrl)
  const checks = [
    ['APP_ENV', env.APP_ENV === 'production'],
    ['DATABASE_URL', remotePostgres(env)],
    ['BETTER_AUTH_SECRET', strongSecret(env, 'BETTER_AUTH_SECRET')],
    ['ADMIN_BETTER_AUTH_SECRET', strongSecret(env, 'ADMIN_BETTER_AUTH_SECRET')],
    ['AUTH_SECRET_ISOLATION', strongSecret(env, 'BETTER_AUTH_SECRET') && strongSecret(env, 'ADMIN_BETTER_AUTH_SECRET') && env.BETTER_AUTH_SECRET !== env.ADMIN_BETTER_AUTH_SECRET],
    ['BETTER_AUTH_URL', httpsUrl(env, 'BETTER_AUTH_URL')],
    ['ADMIN_BETTER_AUTH_URL', httpsUrl(env, 'ADMIN_BETTER_AUTH_URL')],
    ['OGUN_WEB_URL', httpsUrl(env, 'OGUN_WEB_URL')],
    ['NEXT_PUBLIC_SITE_URL', httpsUrl(env, 'NEXT_PUBLIC_SITE_URL')],
    ['GOOGLE_OAUTH', googleDisabled || (present(env, 'GOOGLE_CLIENT_ID') && strongSecret(env, 'GOOGLE_CLIENT_SECRET'))],
    ['RESEND', strongSecret(env, 'RESEND_API_KEY') && present(env, 'RESEND_FROM_EMAIL') && /^[^@\s]+@[^@\s]+$/.test(env.RESEND_FROM_EMAIL)],
    ['CRON_SECRET', strongSecret(env, 'CRON_SECRET')],
    ['OPERATIONAL_JOBS_ENABLED', env.OPERATIONAL_JOBS_ENABLED === 'true'],
    ['S3_ENDPOINT', httpsUrl(env, 'S3_ENDPOINT')],
    ['S3_CREDENTIALS', present(env, 'S3_BUCKET') && present(env, 'S3_ACCESS_KEY_ID') && strongSecret(env, 'S3_SECRET_ACCESS_KEY')],
    ['IYZICO_MODE', ['sandbox', 'production'].includes(env.PAYMENTS_MODE) && paymentModeMatches],
    ['IYZICO_CREDENTIALS', strongSecret(env, 'IYZICO_API_KEY') && strongSecret(env, 'IYZICO_SECRET_KEY')],
  ].map(([name, ok]) => ({ name, ok: Boolean(ok) }))
  return { ok: checks.every((check) => check.ok), checks }
}

export function printValidation(result, logger = console) {
  for (const check of result.checks) logger.log(`${check.name}: ${check.ok ? 'PASS' : 'FAIL'}`)
  logger.log(`PRODUCTION_ENV: ${result.ok ? 'PASS' : 'FAIL'}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--schema')) console.log('PRODUCTION_ENV_SCHEMA: PASS')
  else {
    const result = validateProductionEnvironment(process.env)
    printValidation(result)
    if (!result.ok) process.exitCode = 1
  }
}
