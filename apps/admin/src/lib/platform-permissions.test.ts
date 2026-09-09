import { describe, expect, it } from 'vitest'
import { PLATFORM_PERMISSIONS, permissionsForRole, roleHasPermission } from './platform-permissions'

describe('platform permission matrix', () => {
  it('gives super_admin every permission', () => expect(permissionsForRole('super_admin')).toEqual(PLATFORM_PERMISSIONS))
  it('denies clinical publish to support', () => expect(roleHasPermission('support', 'clinical.publish')).toBe(false))
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
  it('allows clinical assignment to clinical_ops', () => expect(roleHasPermission('clinical_ops', 'clinical.tasks.assign')).toBe(true))
  it('allows food write to food_editor', () => expect(roleHasPermission('food_editor', 'foods.write')).toBe(true))
  it('denies all mutations to read_only', () => {
    expect(permissionsForRole('read_only').every((permission) => permission.endsWith('.read'))).toBe(true)
  })
})
