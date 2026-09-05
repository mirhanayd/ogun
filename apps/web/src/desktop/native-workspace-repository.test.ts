import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { createNativeRepositories, workspaceToLocalDomains } from './native-workspace-repository'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('native repository assignment invariants', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  })
  for (const role of ['owner', 'dietitian'] as const) {
    it(`${role} creation writes the correct optimistic assignment and canonical outbox`, async () => {
      const repository = createNativeRepositories({ userId: 'user', clinicId: 'clinic', displayName: 'Dyt. Test', role, capabilities: [] })
      await repository.clients.create({ id: 'client', firstName: 'Test', lastName: 'Client' })
      expect(invoke).toHaveBeenCalledWith('apply_local_mutation', expect.objectContaining({
        mutation: expect.objectContaining({
          kind: 'client.create',
          projection: expect.objectContaining({ assignedDietitianId: role === 'dietitian' ? 'user' : null, assignedDietitianName: role === 'dietitian' ? 'Dyt. Test' : null }),
        }),
      }))
    })
  }
  for (const role of ['dietitian', 'assistant'] as const) {
    it(`${role} cannot enqueue manual assignment`, async () => {
      const repository = createNativeRepositories({ userId: 'user', clinicId: 'clinic', role, capabilities: [] })
      await expect(repository.clients.assignDietitian(['client'], 'another')).rejects.toThrow('yalnız klinik sahibi')
      expect(invoke).not.toHaveBeenCalled()
    })
  }
})

describe('desktop workspace projection', () => {
  it('projects every offline domain without loading one JSON snapshot into the UI', () => {
    const capturedAt = '2026-08-30T09:00:00.000Z'
    const domains = workspaceToLocalDomains({
      version: 2,
      capturedAt,
      scope: { userId: 'user-1', clinicId: 'clinic-1', role: 'owner' },
      clinic: { id: 'clinic-1', name: 'Öğün Klinik' },
      clients: [{ id: 'client-1', firstName: 'Ada', updatedAt: '2026-08-30T08:00:00.000Z' }],
      anamneses: [{ id: 'anamnesis-1', clientId: 'client-1', notes: 'Öykü' }],
      measurements: [{ id: 'measurement-1', clientId: 'client-1' }],
      goals: [{ id: 'goal-1', clientId: 'client-1' }],
      labResults: [{ id: 'lab-1', clientId: 'client-1' }],
      payments: [{ id: 'payment-1', clientId: 'client-1' }],
      documents: [{ id: 'document-1', clientId: 'client-1' }],
      billingPackages: [{ id: 'package-1', name: 'Kontrol paketi' }],
      clientPackages: [{ id: 'client-package-1', clientId: 'client-1' }],
      expenses: [{ id: 'expense-1', amount: '450.00' }],
      workingHours: [{ id: 'hours-1', dayOfWeek: 1 }],
      plans: [{ id: 'plan-1', clientId: 'client-1' }],
      appointments: [{ id: 'appointment-1', clientId: 'client-1' }],
      customFoods: [{ id: 'food-1', nameTr: 'Ev yapımı çorba' }],
      dietitians: [{ id: 'user-1', name: 'Dyt. Ada Demir' }],
    })

    expect(Object.keys(domains)).toEqual([
      'clinic',
      'clients',
      'anamneses',
      'measurements',
      'goals',
      'labResults',
      'payments',
      'documents',
      'billingPackages',
      'clientPackages',
      'expenses',
      'workingHours',
      'plans',
      'appointments',
      'customFoods',
      'dietitians',
    ])
    expect(domains.anamneses?.[0]?.id).toBe('client-1')
    expect(domains.anamneses?.[0]?.payload.id).toBe('client-1')
    expect(domains.clients?.[0]?.updatedAt).toBe('2026-08-30T08:00:00.000Z')
    expect(domains.plans?.[0]?.updatedAt).toBe(capturedAt)
  })

  it('rejects a malformed entity before replacing the local transaction', () => {
    expect(() =>
      workspaceToLocalDomains({
        version: 2,
        capturedAt: '2026-08-30T09:00:00.000Z',
        scope: { userId: 'user-1', clinicId: 'clinic-1', role: 'owner' },
        clinic: { id: 'clinic-1', name: 'Öğün Klinik' },
        clients: [{ firstName: 'Kimliksiz' } as never],
      }),
    ).toThrow('yerel kimliği bulunamadı')
  })
})
