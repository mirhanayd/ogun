import { describe, expect, it } from 'vitest'
import {
  desktopPinDestination,
  remainingOfflineMutations,
  remapOfflineMutation,
} from './desktop-offline'

const planMutation = {
  id: 'mutation-plan',
  kind: 'plan.create' as const,
  payload: { id: 'local-plan', clientId: 'local-client', name: 'Plan' },
  createdAt: '2026-08-23T10:00:00.000Z',
}

describe('desktop offline mutation reconciliation', () => {
  it('PIN yöntemini değil bağlantıyı çalışma alanı seçimi için kullanır', () => {
    expect(desktopPinDestination(true)).toBe('online-app')
    expect(desktopPinDestination(false)).toBe('local-workspace')
  })

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

  it('klinik alt kayıtlarının danışan ilişkisini de yeniden eşler', () => {
    const measurementMutation = {
      id: 'mutation-measurement',
      kind: 'measurement.create' as const,
      payload: { id: 'local-measurement', clientId: 'local-client', weightKg: 71.4 },
      createdAt: '2026-08-23T11:00:00.000Z',
    }

    expect(
      remapOfflineMutation(measurementMutation, { 'local-client': 'client-server' }).payload,
    ).toMatchObject({ id: 'local-measurement', clientId: 'client-server' })
  })
})
