import { auth } from '@/lib/auth'

type SocialSignInPayload = {
  url?: string
}

/**
 * Starts native Google OAuth inside the system browser so Better Auth's state
 * cookie and Google's callback are handled by the same browser cookie jar.
 */
export async function GET(request: Request) {
  const callbackURL = new URL('/api/auth/native/callback', request.url).toString()
  const authResponse = await auth.api.signInSocial({
    headers: request.headers,
    body: {
      provider: 'google',
      callbackURL,
      errorCallbackURL: callbackURL,
      disableRedirect: true,
    },
    asResponse: true,
  })

  if (!authResponse.ok) return authResponse

  const payload = (await authResponse.json()) as SocialSignInPayload
  if (!payload.url) {
    return new Response('Google giriş adresi oluşturulamadı.', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const headers = new Headers(authResponse.headers)
  headers.set('Location', payload.url)
  headers.set('Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  return new Response(null, { status: 302, headers })
}
