import { describe, expect, it } from 'vitest'
import { workspaceToLocalDomains } from './native-workspace-repository'

describe('desktop workspace projection', () => {
  it('projects every offline domain without loading one JSON snapshot into the UI', () => {
    const capturedAt = '2026-08-30T09:00:00.000Z'
    const domains = workspaceToLocalDomains({
      version: 2,
      capturedAt,
      clinic: { id: 'clinic-1', name: 'Öğün Klinik' },
      clients: [{ id: 'client-1', firstName: 'Ada', updatedAt: '2026-08-30T08:00:00.000Z' }],
      anamneses: [{ id: 'anamnesis-1', clientId: 'client-1', notes: 'Öykü' }],
      measurements: [{ id: 'measurement-1', clientId: 'client-1' }],
      goals: [{ id: 'goal-1', clientId: 'client-1' }],
      labResults: [{ id: 'lab-1', clientId: 'client-1' }],
      payments: [{ id: 'payment-1', clientId: 'client-1' }],
      plans: [{ id: 'plan-1', clientId: 'client-1' }],
      appointments: [{ id: 'appointment-1', clientId: 'client-1' }],
      customFoods: [{ id: 'food-1', nameTr: 'Ev yapımı çorba' }],
    })

    expect(Object.keys(domains)).toEqual([
      'clinic',
      'clients',
      'anamneses',
      'measurements',
      'goals',
      'labResults',
      'payments',
      'plans',
      'appointments',
      'customFoods',
    ])
    expect(domains.anamneses?.[0]?.id).toBe('anamnesis-1')
    expect(domains.clients?.[0]?.updatedAt).toBe('2026-08-30T08:00:00.000Z')
    expect(domains.plans?.[0]?.updatedAt).toBe(capturedAt)
  })

  it('rejects a malformed entity before replacing the local transaction', () => {
    expect(() =>
      workspaceToLocalDomains({
        version: 2,
        capturedAt: '2026-08-30T09:00:00.000Z',
        clinic: { id: 'clinic-1', name: 'Öğün Klinik' },
        clients: [{ firstName: 'Kimliksiz' } as never],
      }),
    ).toThrow('yerel kimliği bulunamadı')
  })
})
