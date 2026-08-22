import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateOneTimeToken, getSession } = vi.hoisted(() => ({
  generateOneTimeToken: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { generateOneTimeToken, getSession } },
}))

import { GET } from './route'

describe('native Google OAuth callback', () => {
  beforeEach(() => {
    generateOneTimeToken.mockReset()
    getSession.mockReset()
  })

  it('OAuth hatasını no_session diye gizlemeden uygulamaya iletir', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/auth/native/callback?error=account_not_linked'),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'ogun://auth/callback?error=account_not_linked',
    )
    expect(getSession).not.toHaveBeenCalled()
  })

  it('bilinmeyen sağlayıcı hatasını güvenli jenerik koda indirger', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/auth/native/callback?error=sensitive_details'),
    )

    expect(response.headers.get('location')).toBe(
      'ogun://auth/callback?error=google_oauth_failed',
    )
  })

  it('tarayıcı oturumu varsa tek kullanımlık token üretir', async () => {
    getSession.mockResolvedValue({ session: { id: 'session-id' }, user: { id: 'user-id' } })
    generateOneTimeToken.mockResolvedValue({ token: 'short-lived-token' })

    const response = await GET(
      new Request('http://localhost:3000/api/auth/native/callback', {
        headers: { cookie: 'better-auth.session_token=signed' },
      }),
    )

    expect(response.headers.get('location')).toBe(
      'ogun://auth/callback?ott=short-lived-token',
    )
    expect(generateOneTimeToken).toHaveBeenCalledOnce()
  })
})
