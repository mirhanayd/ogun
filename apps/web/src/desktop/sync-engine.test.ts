import { describe, expect, it } from 'vitest'
import { assertWorkspaceScope, outboxToSyncMutation } from './sync-engine'

describe('desktop durable sync envelope', () => {
  it('preserves the idempotency key across retries', () => {
    const pending = {
      mutationId: '01J8MUTATION',
      kind: 'measurement.create',
      payload: { id: 'measurement-1', clientId: 'client-1', weightKg: 62.4 },
      createdAt: '2026-08-30T09:00:00.000Z',
    }

    expect(outboxToSyncMutation(pending)).toEqual({
      id: '01J8MUTATION',
      kind: 'measurement.create',
      payload: pending.payload,
      createdAt: pending.createdAt,
    })
    expect(outboxToSyncMutation(pending).id).toBe(outboxToSyncMutation(pending).id)
  })

  it('rejects a cached cloud session belonging to another local profile', () => {
    const local = { userId: 'local-user', clinicId: 'local-clinic', role: 'owner' as const, capabilities: ['*'] }
    const workspace = {
      version: 2,
      capturedAt: '2026-08-31T00:00:00.000Z',
      scope: { userId: 'cloud-user', clinicId: 'cloud-clinic', role: 'owner' as const },
      clinic: { id: 'cloud-clinic', name: 'Başka Klinik' },
    }
    expect(() => assertWorkspaceScope(local, workspace)).toThrow('Bulut oturumu açık yerel profil ile eşleşmiyor')
    expect(() => assertWorkspaceScope(local, { ...workspace, scope: { userId: local.userId, clinicId: local.clinicId, role: local.role } })).not.toThrow()
  })
})
