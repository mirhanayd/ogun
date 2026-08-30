import { describe, expect, it } from 'vitest'
import { outboxToSyncMutation } from './sync-engine'

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
})
