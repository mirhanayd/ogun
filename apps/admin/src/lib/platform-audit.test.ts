import { describe, expect, it, vi } from 'vitest'
import type { PlatformStaffContext } from './platform-authz'
import { withPlatformAudit } from './platform-audit'

const ctx: PlatformStaffContext = {
  user: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
  sessionId: 'session-1',
  staff: { id: 'staff-1', role: 'super_admin' },
  permissions: [],
  mfaEnabled: true,
}

describe('platform audit wrapper', () => {
  it('records actor, entity and success outcome', async () => {
    const recorder = vi.fn(async () => undefined)
    const wrapped = withPlatformAudit<[string], string>({ action: 'thing.update', entityType: 'thing', entityId: ([id]) => id }, async (_ctx, id) => id, recorder)
    await expect(wrapped(ctx, 'thing-1')).resolves.toBe('thing-1')
    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-1', platformStaffId: 'staff-1', entityId: 'thing-1', outcome: 'success' }))
  })

  it('records failures and rethrows the original error', async () => {
    const recorder = vi.fn(async () => undefined)
    const failure = new Error('boom')
    const wrapped = withPlatformAudit({ action: 'thing.update', entityType: 'thing' }, async () => { throw failure }, recorder)
    await expect(wrapped(ctx)).rejects.toBe(failure)
    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', reason: 'boom' }))
  })
})
