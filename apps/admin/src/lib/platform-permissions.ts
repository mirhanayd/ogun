import type { PlatformStaffRole } from '@ogun/db/schema'

export const PLATFORM_PERMISSIONS = [
  'dashboard.read',
  'clinics.read',
  'clinics.manage',
  'users.read',
  'users.send_password_reset',
  'users.revoke_session',
  'devices.read',
  'devices.manage',
  'tickets.read',
  'tickets.manage',
  'clinical.reviewers.read',
  'clinical.reviewers.manage',
  'clinical.tasks.read',
  'clinical.tasks.assign',
  'clinical.publish',
  'foods.read',
  'foods.write',
  'foods.publish',
  'subscriptions.read',
  'subscriptions.manage',
  'system.read',
  'system.manage',
  'audit.read',
  'platform_staff.read',
  'platform_staff.manage',
] as const

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]

const readOnlyPermissions = PLATFORM_PERMISSIONS.filter((permission) => permission.endsWith('.read'))

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformStaffRole, readonly PlatformPermission[]> = {
  super_admin: PLATFORM_PERMISSIONS,
  support: [
    'dashboard.read',
    'clinics.read',
    'users.read',
    'users.send_password_reset',
    'users.revoke_session',
    'devices.read',
    'devices.manage',
    'tickets.read',
    'tickets.manage',
    'system.read',
  ],
  clinical_ops: [
    'dashboard.read',
    'clinical.reviewers.read',
    'clinical.reviewers.manage',
    'clinical.tasks.read',
    'clinical.tasks.assign',
    'clinical.publish',
  ],
  food_editor: ['dashboard.read', 'foods.read', 'foods.write', 'foods.publish'],
  billing_ops: ['dashboard.read', 'clinics.read', 'subscriptions.read', 'subscriptions.manage', 'system.read'],
  read_only: readOnlyPermissions,
}

export function permissionsForRole(role: PlatformStaffRole): readonly PlatformPermission[] {
  return PLATFORM_ROLE_PERMISSIONS[role]
}

export function roleHasPermission(role: PlatformStaffRole, permission: PlatformPermission) {
  return PLATFORM_ROLE_PERMISSIONS[role].includes(permission)
}
