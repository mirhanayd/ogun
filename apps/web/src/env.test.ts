import { describe, expect, it } from 'vitest'
import { assertValidEnv, validateEnv } from './env'

// GitHub issue #46 / Prompt 8.2, GÖREV 1 — "env.ts'in gerçek unit testleri
// olmalı (eksik değişken reddi, geçerli yapılandırma kabulü)."

const validLocalEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/ogun',
  BETTER_AUTH_SECRET: 'test-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_BETTER_AUTH_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'ogun-documents',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
}

describe('validateEnv', () => {
  it('geçerli local yapılandırmayı kabul eder', () => {
    const result = validateEnv(validLocalEnv)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.env.DATABASE_URL).toBe(validLocalEnv.DATABASE_URL)
    }
  })

  it('DATABASE_URL eksikse reddeder ve hangi değişkenin eksik olduğunu söyler', () => {
    const rest: NodeJS.ProcessEnv = { ...validLocalEnv }
    delete rest.DATABASE_URL
    const result = validateEnv(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('DATABASE_URL')
    }
  })

  it('S3 değişkenlerinden biri eksikse reddeder', () => {
    const rest: NodeJS.ProcessEnv = { ...validLocalEnv }
    delete rest.S3_ACCESS_KEY_ID
    const result = validateEnv(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('S3_ACCESS_KEY_ID')
    }
  })

  it('BETTER_AUTH_URL geçerli bir URL değilse reddeder', () => {
    const result = validateEnv({ ...validLocalEnv, BETTER_AUTH_URL: 'not-a-url' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('BETTER_AUTH_URL')
    }
  })

  it('local ortamda RESEND değişkenleri olmadan geçerlidir (e-posta özelliği opsiyonel)', () => {
    const result = validateEnv(validLocalEnv)
    expect(result.success).toBe(true)
  })

  it('staging ortamında RESEND_API_KEY eksikse reddeder', () => {
    const result = validateEnv({ ...validLocalEnv, APP_ENV: 'staging' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('RESEND_API_KEY')
      expect(result.message).toContain('RESEND_FROM_EMAIL')
    }
  })

  it('production ortamında RESEND değişkenleri doluysa kabul eder', () => {
    const result = validateEnv({
      ...validLocalEnv,
      APP_ENV: 'production',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'Öğün <bildirim@ogun.co>',
    })
    expect(result.success).toBe(true)
  })

  it('NODE_ENV=production ama APP_ENV yokken de production kuralları uygulanır', () => {
    const result = validateEnv({ ...validLocalEnv, APP_ENV: undefined, NODE_ENV: 'production' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('RESEND_API_KEY')
    }
  })

  it('GOOGLE_CLIENT_ID doluyken GOOGLE_CLIENT_SECRET boşsa reddeder', () => {
    const result = validateEnv({ ...validLocalEnv, GOOGLE_CLIENT_ID: 'abc' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toContain('GOOGLE_CLIENT_ID')
    }
  })

  it('GOOGLE_CLIENT_ID ve SECRET ikisi de doluyken kabul eder', () => {
    const result = validateEnv({
      ...validLocalEnv,
      GOOGLE_CLIENT_ID: 'abc',
      GOOGLE_CLIENT_SECRET: 'def',
    })
    expect(result.success).toBe(true)
  })

  it('SENTRY_DSN olmadan production ortamı bile geçerlidir (Sentry her zaman opsiyonel — #45 kararı)', () => {
    const result = validateEnv({
      ...validLocalEnv,
      APP_ENV: 'production',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'Öğün <bildirim@ogun.co>',
    })
    expect(result.success).toBe(true)
  })
})

describe('assertValidEnv', () => {
  it('geçerli yapılandırmada throw etmez ve tipli env döner', () => {
    expect(() => assertValidEnv(validLocalEnv)).not.toThrow()
    const env = assertValidEnv(validLocalEnv)
    expect(env.DATABASE_URL).toBe(validLocalEnv.DATABASE_URL)
  })

  it('eksik değişkende throw eder', () => {
    const rest: NodeJS.ProcessEnv = { ...validLocalEnv }
    delete rest.BETTER_AUTH_SECRET
    expect(() => assertValidEnv(rest)).toThrow(/BETTER_AUTH_SECRET/)
  })
})
