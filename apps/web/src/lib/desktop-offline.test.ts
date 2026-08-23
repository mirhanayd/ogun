import { describe, expect, it } from 'vitest'
import { remainingOfflineMutations, remapOfflineMutation } from './desktop-offline'

const planMutation = {
  id: 'mutation-plan',
  kind: 'plan.create' as const,
  payload: { id: 'local-plan', clientId: 'local-client', name: 'Plan' },
  createdAt: '2026-08-23T10:00:00.000Z',
}

describe('desktop offline mutation reconciliation', () => {
  it('yerel ilişki kimliklerini sunucu kimliklerine dönüştürür', () => {
    expect(
      remapOfflineMutation(planMutation, { 'local-client': 'client-server' }).payload,
    ).toMatchObject({ clientId: 'client-server' })
  })

  it('uygulanan mutasyonları çıkarıp kalanları yeniden eşler', () => {
    const clientMutation = {
      id: 'mutation-client',
      kind: 'client.create' as const,
      payload: { id: 'local-client', firstName: 'Ada' },
      createdAt: '2026-08-23T09:00:00.000Z',
    }
    expect(
      remainingOfflineMutations([clientMutation, planMutation], {
        appliedIds: ['mutation-client'],
        idMap: { 'local-client': 'client-server' },
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'mutation-plan',
        payload: expect.objectContaining({ clientId: 'client-server' }),
      }),
    ])
  })
})
