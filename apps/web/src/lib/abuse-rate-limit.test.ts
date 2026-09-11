import { describe, expect, it } from 'vitest'
import { hashRateLimitIdentifier, requestIp } from './abuse-rate-limit'

describe('custom abuse-limit keys', () => {
  it('stores deterministic hashes instead of raw email/IP/user input', () => {
    const raw = 'User@Example.test'
    const key = hashRateLimitIdentifier('verification-resend', raw.toLowerCase())
    expect(key).toMatch(/^[a-f0-9]{64}$/)
    expect(key).not.toContain('example')
    expect(key).not.toContain('@')
    expect(key).not.toBe(hashRateLimitIdentifier('support-create', raw.toLowerCase()))
  })
  it('uses the first trusted proxy address without storing it directly', () => {
    expect(requestIp(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5')
  })
})
