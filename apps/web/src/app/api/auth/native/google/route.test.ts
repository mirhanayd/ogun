import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }))

vi.mock('@/lib/auth', () => ({
  auth: { api: { signInSocial } },
}))

import { GET } from './route'

describe('native Google OAuth başlangıcı', () => {
  beforeEach(() => {
    signInSocial.mockReset()
  })

  it('state çerezini koruyarak sistem tarayıcısını Google adresine yönlendirir', async () => {
    signInSocial.mockResolvedValue(
      Response.json(
        { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' },
        { headers: { 'Set-Cookie': 'better-auth.state=test; Path=/; HttpOnly; SameSite=Lax' } },
      ),
    )

    const response = await GET(new Request('http://localhost:3000/api/auth/native/google'))

    expect(signInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          provider: 'google',
          callbackURL: 'http://localhost:3000/api/auth/native/callback',
          errorCallbackURL: 'http://localhost:3000/api/auth/native/callback',
          disableRedirect: true,
        },
        asResponse: true,
      }),
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('https://accounts.google.com/')
    expect(response.headers.get('set-cookie')).toContain('better-auth.state=test')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('sağlayıcı URL üretmezse güvenli bir hata döndürür', async () => {
    signInSocial.mockResolvedValue(Response.json({ url: null }))

    const response = await GET(new Request('http://localhost:3000/api/auth/native/google'))

    expect(response.status).toBe(502)
  })
})
