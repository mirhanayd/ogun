import { NextResponse } from 'next/server'

function configuredOrigins(): Set<string> {
  const origins = new Set<string>()
  for (const value of [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    process.env.OGUN_WEB_URL,
  ]) {
    if (!value) continue
    try {
      origins.add(new URL(value).origin)
    } catch {
      // Environment validation reports malformed URLs. Do not trust them here.
    }
  }
  return origins
}

/**
 * Custom mutation routes do not receive Next Server Action's Origin/Host
 * protection. Browser-cookie requests must therefore present a same-origin
 * Origin. Native and server-to-server callers authenticate with a bearer token
 * and are intentionally exempt from browser origin semantics.
 */
export function isTrustedMutationOrigin(request: Request): boolean {
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return true
  const origin = request.headers.get('origin')
  if (!origin) return false

  const allowed = configuredOrigins()
  try {
    allowed.add(new URL(request.url).origin)
    return allowed.has(new URL(origin).origin)
  } catch {
    return false
  }
}

export function rejectUntrustedMutationOrigin(request: Request): NextResponse | null {
  return isTrustedMutationOrigin(request)
    ? null
    : NextResponse.json({ error: 'invalid_request_origin' }, { status: 403 })
}
