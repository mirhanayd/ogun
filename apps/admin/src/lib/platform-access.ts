import type { PlatformStaffRole } from '@ogun/db/schema'

export type PlatformAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'unauthenticated' | 'not_staff' | 'inactive' | 'mfa_required' }

export function evaluatePlatformAccess(input: {
  authenticated: boolean
  staff: { role: PlatformStaffRole; isActive: boolean } | null
  twoFactorEnabled: boolean
  allowUnenrolled?: boolean
}): PlatformAccessDecision {
  if (!input.authenticated) return { allowed: false, reason: 'unauthenticated' }
  if (!input.staff) return { allowed: false, reason: 'not_staff' }
  if (!input.staff.isActive) return { allowed: false, reason: 'inactive' }
  if (!input.twoFactorEnabled && !input.allowUnenrolled) return { allowed: false, reason: 'mfa_required' }
  return { allowed: true }
}
