import { describe, expect, it } from 'vitest'
import { PLATFORM_PERMISSIONS, permissionsForRole, roleHasPermission } from './platform-permissions'

describe('platform permission matrix', () => {
  it('gives super_admin every permission', () =>
    expect(permissionsForRole('super_admin')).toEqual(PLATFORM_PERMISSIONS))
  it('denies clinical publish to support', () =>
    expect(roleHasPermission('support', 'clinical.publish')).toBe(false))
  it('allows support account and device operations', () => {
    expect(roleHasPermission('support', 'users.revoke_session')).toBe(true)
    expect(roleHasPermission('support', 'users.send_password_reset')).toBe(true)
    expect(roleHasPermission('support', 'devices.manage')).toBe(true)
    expect(roleHasPermission('support', 'tickets.manage')).toBe(true)
  })
  it('keeps ticket read/manage boundaries canonical', () => {
    expect(roleHasPermission('read_only', 'tickets.read')).toBe(true)
    expect(roleHasPermission('read_only', 'tickets.manage')).toBe(false)
    expect(roleHasPermission('clinical_ops', 'tickets.read')).toBe(false)
    expect(roleHasPermission('clinical_ops', 'tickets.manage')).toBe(false)
  })
  it('allows clinical assignment to clinical_ops', () =>
    expect(roleHasPermission('clinical_ops', 'clinical.tasks.assign')).toBe(true))
  it('keeps reviewer operations behind dedicated permissions', () => {
    expect(roleHasPermission('clinical_ops', 'clinical.reviewers.manage')).toBe(true)
    expect(roleHasPermission('support', 'clinical.reviewers.read')).toBe(false)
    expect(roleHasPermission('support', 'clinical.reviewers.manage')).toBe(false)
    expect(roleHasPermission('read_only', 'clinical.reviewers.read')).toBe(true)
    expect(roleHasPermission('read_only', 'clinical.reviewers.manage')).toBe(false)
    expect(roleHasPermission('read_only', 'clinical.tasks.assign')).toBe(false)
  })
  it('keeps food operations behind the canonical food permission matrix', () => {
    for (const permission of ['foods.read', 'foods.write', 'foods.publish'] as const)
      expect(roleHasPermission('food_editor', permission)).toBe(true)

    for (const role of ['support', 'clinical_ops'] as const)
      for (const permission of ['foods.read', 'foods.write', 'foods.publish'] as const)
        expect(roleHasPermission(role, permission)).toBe(false)

    expect(roleHasPermission('read_only', 'foods.read')).toBe(true)
    expect(roleHasPermission('read_only', 'foods.write')).toBe(false)
    expect(roleHasPermission('read_only', 'foods.publish')).toBe(false)
  })
  it('allows billing_ops and denies support subscription access', () => {
    expect(roleHasPermission('billing_ops', 'subscriptions.read')).toBe(true)
    expect(roleHasPermission('billing_ops', 'subscriptions.manage')).toBe(true)
    expect(roleHasPermission('support', 'subscriptions.read')).toBe(false)
    expect(roleHasPermission('support', 'subscriptions.manage')).toBe(false)
    expect(roleHasPermission('read_only', 'subscriptions.read')).toBe(true)
    expect(roleHasPermission('read_only', 'subscriptions.manage')).toBe(false)
  })
  it('denies all mutations to read_only', () => {
    expect(
      permissionsForRole('read_only').every((permission) => permission.endsWith('.read')),
    ).toBe(true)
  })
  it('separates system visibility from operational mutation', () => {
    expect(roleHasPermission('support', 'system.read')).toBe(true)
    expect(roleHasPermission('support', 'system.manage')).toBe(false)
    expect(roleHasPermission('billing_ops', 'system.read')).toBe(true)
    expect(roleHasPermission('read_only', 'system.read')).toBe(true)
    expect(roleHasPermission('read_only', 'system.manage')).toBe(false)
    expect(roleHasPermission('clinical_ops', 'system.read')).toBe(false)
  })
})
