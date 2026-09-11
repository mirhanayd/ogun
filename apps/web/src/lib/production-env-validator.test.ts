import { describe, expect, it, vi } from 'vitest'
import { printValidation, validateProductionEnvironment } from '../../../../scripts/validate-production-env.mjs'

const valid = {
  APP_ENV: 'production', DATABASE_URL: 'postgresql://ogun:a-strong-db-password@db.ogun.test:5432/ogun',
  BETTER_AUTH_SECRET: 'web-secret-with-at-least-thirty-two-characters',
  ADMIN_BETTER_AUTH_SECRET: 'admin-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'https://app.ogun.test', ADMIN_BETTER_AUTH_URL: 'https://ops.ogun.test',
  OGUN_WEB_URL: 'https://app.ogun.test', NEXT_PUBLIC_SITE_URL: 'https://ogun.test',
  RESEND_API_KEY: 'resend-key-with-at-least-thirty-two-characters', RESEND_FROM_EMAIL: 'noreply@ogun.test',
  CRON_SECRET: 'cron-secret-with-at-least-thirty-two-characters', OPERATIONAL_JOBS_ENABLED: 'true',
  S3_ENDPOINT: 'https://objects.ogun.test', S3_BUCKET: 'private-documents', S3_ACCESS_KEY_ID: 'access-id',
  S3_SECRET_ACCESS_KEY: 'storage-secret-with-at-least-thirty-two-characters',
  PAYMENTS_MODE: 'sandbox', IYZICO_BASE_URL: 'https://sandbox-api.iyzipay.com',
  IYZICO_API_KEY: 'iyzico-api-key-with-at-least-thirty-two-characters',
  IYZICO_SECRET_KEY: 'iyzico-secret-with-at-least-thirty-two-characters',
}

describe('production environment validator', () => {
  it('accepts an explicit, isolated production configuration', () => {
    expect(validateProductionEnvironment(valid).ok).toBe(true)
  })
  it('rejects local URLs, placeholders, secret reuse and payment-mode mismatch', () => {
    const result = validateProductionEnvironment({ ...valid,
      DATABASE_URL: 'postgresql://postgres:change-me-in-production@localhost:5432/ogun',
      ADMIN_BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET, BETTER_AUTH_URL: 'http://localhost:3000',
      PAYMENTS_MODE: 'production',
    })
    expect(result.ok).toBe(false)
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'AUTH_SECRET_ISOLATION', 'BETTER_AUTH_URL', 'IYZICO_MODE']),
    )
  })
  it('prints only names and PASS/FAIL, never values', () => {
    const log = vi.fn()
    printValidation(validateProductionEnvironment(valid), { log })
    const output = log.mock.calls.flat().join('\n')
    expect(output).not.toContain(valid.BETTER_AUTH_SECRET)
    expect(output).not.toContain(valid.DATABASE_URL)
    expect(output).toContain('AUTH_SECRET_ISOLATION: PASS')
  })
})
