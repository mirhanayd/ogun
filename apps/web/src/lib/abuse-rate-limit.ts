import 'server-only'
import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { consumeAbuseRateLimit } from '@ogun/db/queries'

export function hashRateLimitIdentifier(namespace: string, identifier: string): string {
  return createHash('sha256').update(`${namespace}\n${identifier}`, 'utf8').digest('hex')
}

export function requestIp(requestHeaders: Headers): string {
  return requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || requestHeaders.get('x-real-ip')?.trim()
    || 'unknown'
}

export async function enforceUserRateLimit(
  namespace: string,
  userId: string,
  options: { max: number; windowSeconds: number },
) {
  const result = await consumeAbuseRateLimit(db, {
    keyHash: hashRateLimitIdentifier(namespace, `user:${userId}`),
    ...options,
  })
  if (!result.allowed) throw new Error(`rate_limited:${result.retryAfterSeconds}`)
}

export async function enforcePublicRateLimit(
  namespace: string,
  options: { max: number; windowSeconds: number },
) {
  const requestHeaders = await headers()
  const result = await consumeAbuseRateLimit(db, {
    keyHash: hashRateLimitIdentifier(namespace, `ip:${requestIp(requestHeaders)}`),
    ...options,
  })
  return result
}
