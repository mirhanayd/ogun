import { describe, expect, it } from 'vitest'
import { evaluatePlatformAccess } from './platform-access'

const activeStaff = { role: 'support' as const, isActive: true }

describe('platform access gating', () => {
  it('denies unauthenticated requests', () => expect(evaluatePlatformAccess({ authenticated: false, staff: null, twoFactorEnabled: false })).toEqual({ allowed: false, reason: 'unauthenticated' }))
  it('denies normal users without platform_staff', () => expect(evaluatePlatformAccess({ authenticated: true, staff: null, twoFactorEnabled: true })).toEqual({ allowed: false, reason: 'not_staff' }))
  it('denies inactive staff', () => expect(evaluatePlatformAccess({ authenticated: true, staff: { ...activeStaff, isActive: false }, twoFactorEnabled: true })).toEqual({ allowed: false, reason: 'inactive' }))
  it('requires enrollment for staff without MFA', () => expect(evaluatePlatformAccess({ authenticated: true, staff: activeStaff, twoFactorEnabled: false })).toEqual({ allowed: false, reason: 'mfa_required' }))
  it('allows unenrolled staff only at enrollment boundary', () => expect(evaluatePlatformAccess({ authenticated: true, staff: activeStaff, twoFactorEnabled: false, allowUnenrolled: true })).toEqual({ allowed: true }))
  it('accepts active staff with MFA', () => expect(evaluatePlatformAccess({ authenticated: true, staff: activeStaff, twoFactorEnabled: true })).toEqual({ allowed: true }))
})
