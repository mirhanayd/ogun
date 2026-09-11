export const OPERATIONAL_JOB_NAMES = [
  'sms_reminders',
  'email_retry',
  'subscription_reconciliation',
  'maintenance',
] as const

export type OperationalJobName = (typeof OPERATIONAL_JOB_NAMES)[number]

export const OPERATIONAL_BATCH_SIZE = 100
export const OPERATIONAL_JOB_LEASE_MS = 10 * 60 * 1000
export const DELIVERY_CLAIM_MS = 5 * 60 * 1000
export const EMAIL_MAX_ATTEMPTS = 5
export const SMS_MAX_ATTEMPTS = 4
export const OPERATIONAL_RUN_RETENTION_DAYS = 90

// Attempt 1 is immediate; these delays apply after failed attempts 1..4.
export const EMAIL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const
export const SMS_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const

export function nextRetryAt(now: Date, attemptCount: number, kind: 'email' | 'sms') {
  const delays = kind === 'email' ? EMAIL_RETRY_DELAYS_MS : SMS_RETRY_DELAYS_MS
  const delay = delays[Math.max(0, Math.min(delays.length - 1, attemptCount - 1))]!
  return new Date(now.getTime() + delay)
}

export function isRetryableDeliveryError(error: unknown) {
  if (!(error instanceof Error)) return true
  const code = 'code' in error ? String(error.code).toLowerCase() : ''
  const message = error.message.toLowerCase()
  return !(
    code.includes('invalid') ||
    code.includes('unauthorized') ||
    message.includes('invalid recipient') ||
    message.includes('geçersiz alıcı') ||
    message.includes('consent')
  )
}

export function safeDeliveryErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)
    if (code) return code
  }
  return 'provider_error'
}
