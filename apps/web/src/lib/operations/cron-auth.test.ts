import { describe, expect, it } from 'vitest'
import { areOperationalJobsEnabled, externalDeliveryAllowed, isCronRequestAuthorized } from './cron-auth'

describe('cron security policy', () => {
  it('fails closed for missing/wrong secrets and accepts the exact bearer secret', () => {
    expect(isCronRequestAuthorized(null, undefined)).toBe(false)
    expect(isCronRequestAuthorized('Bearer wrong', 'correct')).toBe(false)
    expect(isCronRequestAuthorized('Bearer correct', 'correct')).toBe(true)
  })
  it('keeps preview disabled and requires explicit job activation', () => {
    expect(areOperationalJobsEnabled({ OPERATIONAL_JOBS_ENABLED: 'false' })).toBe(false)
    expect(areOperationalJobsEnabled({ OPERATIONAL_JOBS_ENABLED: 'true', VERCEL_ENV: 'preview' })).toBe(false)
    expect(areOperationalJobsEnabled({ OPERATIONAL_JOBS_ENABLED: 'true', VERCEL_ENV: 'production' })).toBe(true)
  })
  it('requires explicit external delivery outside production', () => {
    expect(externalDeliveryAllowed({ APP_ENV: 'local' })).toBe(false)
    expect(externalDeliveryAllowed({ APP_ENV: 'local', EXTERNAL_DELIVERY_ENABLED: 'true' })).toBe(true)
  })
})
