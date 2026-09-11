import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function isCronRequestAuthorized(authorization: string | null, secret: string | undefined) {
  if (!secret?.trim() || !authorization?.startsWith('Bearer ')) return false
  const received = authorization.slice('Bearer '.length)
  return timingSafeEqual(digest(received), digest(secret))
}

export function areOperationalJobsEnabled(environment: Record<string, string | undefined> = process.env) {
  if (environment.OPERATIONAL_JOBS_ENABLED !== 'true') return false
  // Vercel previews must never run production schedules, even if copied env
  // variables accidentally include the enable flag.
  if (environment.VERCEL_ENV === 'preview') return false
  return true
}

export function externalDeliveryAllowed(environment: Record<string, string | undefined> = process.env) {
  return environment.APP_ENV === 'production' || environment.EXTERNAL_DELIVERY_ENABLED === 'true'
}
