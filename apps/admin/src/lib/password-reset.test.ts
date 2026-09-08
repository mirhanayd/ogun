import { describe, expect, it, vi } from 'vitest'
import { PASSWORD_RESET_COOLDOWN_MS, requestUserPasswordReset } from './password-reset'

describe('admin password reset transport', () => {
  it('uses the official Better Auth 1.6.29 request endpoint and configured origin', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await requestUserPasswordReset({ webOrigin: 'https://app.example.com/base', email: 'user@example.com', fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://app.example.com/api/auth/request-password-reset')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Origin: 'https://app.example.com' })
    expect(JSON.parse(String(init.body))).toEqual({ email: 'user@example.com', redirectTo: 'https://app.example.com/sifre-sifirla' })
    expect(PASSWORD_RESET_COOLDOWN_MS).toBe(60_000)
  })

  it('rejects non-http origins and propagates provider failures', async () => {
    await expect(requestUserPasswordReset({ webOrigin: 'file:///tmp', email: 'user@example.com' })).rejects.toThrow('HTTP')
    await expect(requestUserPasswordReset({ webOrigin: 'https://app.example.com', email: 'user@example.com', fetchImpl: async () => new Response(null, { status: 500 }) })).rejects.toThrow('gönderilemedi')
  })
})
