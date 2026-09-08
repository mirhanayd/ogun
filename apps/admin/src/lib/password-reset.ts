export const PASSWORD_RESET_COOLDOWN_MS = 60_000

export async function requestUserPasswordReset(input: {
  webOrigin: string
  email: string
  fetchImpl?: typeof fetch
}) {
  const origin = new URL(input.webOrigin)
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('OGUN_WEB_URL geçerli bir HTTP(S) origin olmalı.')
  const fetchImpl = input.fetchImpl ?? fetch
  const endpoint = new URL('/api/auth/request-password-reset', origin)
  const redirectTo = new URL('/sifre-sifirla', origin)
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Origin: origin.origin },
    body: JSON.stringify({ email: input.email, redirectTo: redirectTo.toString() }),
  })
  if (!response.ok) throw new Error('Şifre sıfırlama isteği gönderilemedi.')
}
