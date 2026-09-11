import { afterEach, describe, expect, it } from 'vitest'
import { isTrustedMutationOrigin } from './request-origin'

const original = process.env.BETTER_AUTH_URL

afterEach(() => {
  if (original === undefined) delete process.env.BETTER_AUTH_URL
  else process.env.BETTER_AUTH_URL = original
})

describe('custom mutation origin policy', () => {
  it('allows same-origin browser requests and rejects missing/cross origins', () => {
    const url = 'https://app.ogun.test/api/foods/usage'
    expect(isTrustedMutationOrigin(new Request(url, { method: 'POST', headers: { origin: 'https://app.ogun.test' } }))).toBe(true)
    expect(isTrustedMutationOrigin(new Request(url, { method: 'POST' }))).toBe(false)
    expect(isTrustedMutationOrigin(new Request(url, { method: 'POST', headers: { origin: 'https://evil.test' } }))).toBe(false)
  })

  it('allows configured canonical origins behind a deployment proxy', () => {
    process.env.BETTER_AUTH_URL = 'https://app.ogun.test'
    const request = new Request('http://internal:3000/api/foods/usage', {
      method: 'POST',
      headers: { origin: 'https://app.ogun.test' },
    })
    expect(isTrustedMutationOrigin(request)).toBe(true)
  })

  it('exempts authenticated native/server bearer requests', () => {
    const request = new Request('https://app.ogun.test/api/desktop/workspace', {
      method: 'POST',
      headers: { authorization: 'Bearer opaque-session-token' },
    })
    expect(isTrustedMutationOrigin(request)).toBe(true)
  })
})
