import { describe, expect, it } from 'vitest'
import { describeUserAgent } from './user-agent'

describe('session user agent display', () => {
  it('distinguishes browser sessions from registered desktop sessions', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', false)).toBe('Windows · Chrome')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0)', true)).toBe('Ogun Desktop · Windows')
  })
})
