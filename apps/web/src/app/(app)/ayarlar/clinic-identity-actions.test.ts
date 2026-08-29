import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeClinicId: 'clinic-active',
  currentRole: 'owner',
  db: {},
  revalidatePath: vi.fn(),
  updateClinicIdentity: vi.fn(),
  allowedRoles: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@ogun/db', () => ({ db: mocks.db }))
vi.mock('@ogun/db/queries', () => ({ updateClinicIdentity: mocks.updateClinicIdentity }))
vi.mock('@/lib/audit', () => ({
  withAudit: (_config: unknown, action: (...args: never[]) => unknown) => action,
}))
vi.mock('@/lib/authz', () => ({
  withAuth: (
    action: (
      ctx: { scope: { clinicId: string }; role: string },
      input: unknown,
    ) => Promise<unknown>,
    roles: string[] = [],
  ) => {
    mocks.allowedRoles = [...roles]
    return async (input: unknown) => {
      if (!roles.includes(mocks.currentRole)) throw new Error('Forbidden')
      return action({ scope: { clinicId: mocks.activeClinicId }, role: mocks.currentRole }, input)
    }
  },
}))

import { updateClinicIdentityAction } from './clinic-identity-actions'

const input = {
  name: ' New Clinic ',
  logoUrl: 'https://cdn.example.com/logo.png',
  primaryColor: '#ABCDEF',
  phone: ' +90 555 000 00 00 ',
  address: ' Istanbul ',
  taxId: ' 1234567890 ',
}

describe('updateClinicIdentityAction', () => {
  beforeEach(() => {
    mocks.currentRole = 'owner'
    mocks.revalidatePath.mockReset()
    mocks.updateClinicIdentity.mockReset()
  })

  it('updates every identity field within the active clinic scope', async () => {
    const persisted = {
      name: 'New Clinic',
      logoUrl: input.logoUrl,
      primaryColor: '#abcdef',
      phone: '+90 555 000 00 00',
      address: 'Istanbul',
      taxId: '1234567890',
    }
    const crossTenantPayload = { ...input, clinicId: 'clinic-other' }
    mocks.updateClinicIdentity.mockResolvedValue(persisted)

    const result = await updateClinicIdentityAction(crossTenantPayload)

    expect(mocks.allowedRoles).toEqual(['owner'])
    expect(mocks.updateClinicIdentity).toHaveBeenCalledWith(mocks.db, 'clinic-active', persisted)
    expect(result).toEqual({ success: true, identity: persisted })
  })

  it('rejects non-owner roles before calling the identity service', async () => {
    mocks.currentRole = 'dietitian'

    const result = await updateClinicIdentityAction(input)

    expect(result).toEqual({ success: false, error: 'Forbidden' })
    expect(mocks.updateClinicIdentity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates the shared app layout after a successful save', async () => {
    mocks.updateClinicIdentity.mockResolvedValue({ ...input, name: 'New Clinic' })

    const result = await updateClinicIdentityAction(input)

    expect(result.success).toBe(true)
    expect(mocks.revalidatePath).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('does not touch the database or cache after validation failure', async () => {
    const result = await updateClinicIdentityAction({ ...input, primaryColor: 'not-a-color' })

    expect(result.success).toBe(false)
    expect(mocks.updateClinicIdentity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
