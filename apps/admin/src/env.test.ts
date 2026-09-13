import { describe, expect, it } from 'vitest'
import { assertValidAdminEnvironment, resolveAdminAuthBaseUrl, validateAdminEnvironment } from './env'

const production = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  APP_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@db.ogun.test/ogun',
  ADMIN_BETTER_AUTH_SECRET: 'admin-secret-with-more-than-thirty-two-characters',
  ADMIN_BETTER_AUTH_URL: 'https://ogun-admin.vercel.app',
  OGUN_WEB_URL: 'https://ogun-web.vercel.app',
  RESEND_API_KEY: 're_test_secret',
  RESEND_FROM_EMAIL: 'Ogun <ops@ogun.test>',
} satisfies NodeJS.ProcessEnv

describe('admin environment contract', () => {
  it('accepts a complete production environment', () => {
    expect(validateAdminEnvironment(production).ok).toBe(true)
  })

  it('fails closed when production email delivery is not configured', () => {
    const result = validateAdminEnvironment({ ...production, RESEND_API_KEY: undefined })
    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual({ name: 'RESEND', ok: false })
  })

  it('keeps the admin and web auth secrets isolated', () => {
    const result = validateAdminEnvironment({
      ...production,
      BETTER_AUTH_SECRET: production.ADMIN_BETTER_AUTH_SECRET,
    })
    expect(result.checks).toContainEqual({ name: 'AUTH_SECRET_ISOLATION', ok: false })
  })

  it('uses the exact Vercel deployment URL for previews', () => {
    const preview = {
      ...production,
      VERCEL_ENV: 'preview',
      APP_ENV: 'staging',
      ADMIN_BETTER_AUTH_URL: undefined,
      VERCEL_URL: 'ogun-admin-preview-abc.vercel.app',
      RESEND_API_KEY: undefined,
      RESEND_FROM_EMAIL: undefined,
    }
    expect(resolveAdminAuthBaseUrl(preview)).toBe('https://ogun-admin-preview-abc.vercel.app')
    expect(validateAdminEnvironment(preview).ok).toBe(true)
  })

  it('rejects external email credentials in previews', () => {
    const result = validateAdminEnvironment({
      ...production,
      VERCEL_ENV: 'preview',
      APP_ENV: 'staging',
      ADMIN_BETTER_AUTH_URL: undefined,
      VERCEL_URL: 'ogun-admin-preview-abc.vercel.app',
    })
    expect(result.checks).toContainEqual({ name: 'RESEND', ok: false })
  })

  it('rejects an untrusted preview deployment URL', () => {
    expect(() => resolveAdminAuthBaseUrl({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'attacker.invalid',
    })).toThrow(/Vercel deployment hostname/)
  })

  it('reports only failed check names', () => {
    expect(() => assertValidAdminEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toThrow(
      /DATABASE_URL, ADMIN_BETTER_AUTH_SECRET, ADMIN_BETTER_AUTH_URL, OGUN_WEB_URL, RESEND, APP_ENV/,
    )
  })
})
