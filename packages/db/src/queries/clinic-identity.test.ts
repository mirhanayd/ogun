import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../client'
import {
  editableClinicIdentityFields,
  getClinicIdentityById,
  updateClinicIdentity,
  type ClinicIdentityInput,
} from './clinics'

const identity: ClinicIdentityInput = {
  name: 'Ogun Clinic',
  logoUrl: 'https://cdn.example.com/logo.png',
  primaryColor: '#1b7a5a',
  phone: '+90 555 000 00 00',
  address: 'Istanbul',
  taxId: '1234567890',
}

describe('clinic identity queries', () => {
  it('lists all and only the user-editable identity fields', () => {
    expect(editableClinicIdentityFields).toEqual([
      'name',
      'logoUrl',
      'primaryColor',
      'phone',
      'address',
      'taxId',
    ])
  })

  it('loads every identity field', async () => {
    const limit = vi.fn().mockResolvedValue([identity])
    const where = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn((fields: Record<string, unknown>) => {
      expect(Object.keys(fields)).toEqual(editableClinicIdentityFields)
      return { from }
    })
    const fakeDb = { select } as unknown as Database

    await expect(getClinicIdentityById(fakeDb, 'clinic-1')).resolves.toEqual(identity)
    expect(where).toHaveBeenCalledOnce()
    expect(limit).toHaveBeenCalledWith(1)
  })

  it('persists every identity field without writing internal fields', async () => {
    const returning = vi.fn((fields: Record<string, unknown>) => {
      expect(Object.keys(fields)).toEqual(editableClinicIdentityFields)
      return Promise.resolve([identity])
    })
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn((values: Record<string, unknown>) => {
      expect(values).toEqual(identity)
      expect(values).not.toHaveProperty('slug')
      expect(values).not.toHaveProperty('subscriptionStatus')
      expect(values).not.toHaveProperty('createdBy')
      return { where }
    })
    const update = vi.fn(() => ({ set }))
    const fakeDb = { update } as unknown as Database

    await expect(updateClinicIdentity(fakeDb, 'clinic-1', identity)).resolves.toEqual(identity)
    expect(where).toHaveBeenCalledOnce()
  })

  it('fails instead of reporting success when the target clinic is absent', async () => {
    const fakeDb = {
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }),
    } as unknown as Database

    await expect(updateClinicIdentity(fakeDb, 'missing-clinic', identity)).rejects.toThrow(
      /Klinik bulunamad/,
    )
  })
})
