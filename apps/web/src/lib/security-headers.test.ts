import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, buildSecurityHeaders } from '../../../../scripts/security-headers.mjs'

describe('production security headers', () => {
  it('enforces the required browser policy without wildcard or unsafe-eval', () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders({ NODE_ENV: 'production' }).map(({ key, value }) => [key, value]),
    )
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000')
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
    expect(headers['Content-Security-Policy']).toContain("'wasm-unsafe-eval'")
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self' data:")
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'")
    expect(headers['Content-Security-Policy']).not.toMatch(/(?:^|\s)\*(?:;|\s|$)/)
  })

  it('only derives valid HTTP origins from configured services', () => {
    const csp = buildContentSecurityPolicy({
      S3_ENDPOINT: 'https://objects.example.test/path',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      NEXT_PUBLIC_SENTRY_DSN: 'javascript:alert(1)',
    })
    expect(csp).toContain('https://objects.example.test')
    expect(csp).toContain('https://example.ingest.sentry.io')
    expect(csp).not.toContain('javascript:')
  })
})
