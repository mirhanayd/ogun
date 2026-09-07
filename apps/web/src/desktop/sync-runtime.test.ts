import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./native-workspace-repository', () => ({
  acknowledgeLocalOutbox: vi.fn(), failLocalOutboxMutation: vi.fn(), loadLocalOutbox: vi.fn(), loadLocalOutboxStatus: vi.fn(), replaceLocalWorkspace: vi.fn(), synchronizeLocalFoodCatalog: vi.fn(), synchronizeLocalClinicalCatalog: vi.fn(),
}))
vi.mock('@/lib/native-shell', () => ({ getCachedNativeSessionToken: () => 'secret-test-token' }))
import * as repository from './native-workspace-repository'
import { coreSyncLabel, synchronizeCatalogs, synchronizeDesktopWorkspace } from './sync-engine'
import { SyncPhaseError } from './sync-diagnostics'

const scope = { userId: 'owner', clinicId: 'clinic', role: 'owner' as const, capabilities: ['*'] }
const workspace = { version: 2, scope, clinic: { id: 'clinic', name: 'Test' }, capturedAt: new Date().toISOString() }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(workspace)))
  vi.mocked(repository.loadLocalOutbox).mockResolvedValue([])
  vi.mocked(repository.loadLocalOutboxStatus).mockResolvedValue({ pendingCount: 0, blockedCount: 0, nextRetryAt: null })
})
describe('independent core and catalog health', () => {
  it('reproduces catalog HTTP 503 after core succeeds without changing core current', async () => {
    vi.mocked(repository.synchronizeLocalClinicalCatalog).mockRejectedValue(new SyncPhaseError('clinical_catalog_version', 503, 'http'))
    const core = await synchronizeDesktopWorkspace(scope)
    const results = vi.fn()
    await synchronizeCatalogs(results)
    expect(repository.replaceLocalWorkspace).toHaveBeenCalledWith(scope, workspace)
    expect(coreSyncLabel('current', core.pendingCount)).toBe('Güncel')
    expect(results).toHaveBeenCalledWith('food', null)
    expect(results).toHaveBeenCalledWith('clinical', expect.objectContaining({ phase: 'clinical_catalog_version', httpStatus: 503 }))
  })
  it('reports deferred durable work instead of incorrectly replacing a pending snapshot', async () => {
    vi.mocked(repository.loadLocalOutboxStatus).mockResolvedValue({ pendingCount: 2, blockedCount: 0, nextRetryAt: '2099-01-01T00:00:00Z' })
    expect((await synchronizeDesktopWorkspace(scope)).pendingCount).toBe(2)
    expect(repository.replaceLocalWorkspace).not.toHaveBeenCalled()
    expect(coreSyncLabel('pending_retry', 2)).toBe('2 değişiklik bekliyor')
  })
  it('classifies expired sessions without leaking response bodies or tokens', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'secret-test-token clinical private payload' }, { status: 401 }))
    await expect(synchronizeDesktopWorkspace(scope)).rejects.toMatchObject({ phase: 'auth', httpStatus: 401 })
    expect(repository.loadLocalOutbox).not.toHaveBeenCalled()
    try { await synchronizeDesktopWorkspace(scope) } catch (error) {
      expect(JSON.stringify((error as SyncPhaseError).diagnostic())).not.toContain('secret-test-token')
    }
  })
  it('acknowledges receipts before the reconciliation pull and isolates its failure phase', async () => {
    vi.mocked(repository.loadLocalOutbox).mockResolvedValueOnce([{ mutationId: 'm', kind: 'measurement.create', payload: {}, createdAt: '2026-09-07T00:00:00Z' } as repository.LocalOutboxMutation]).mockResolvedValue([])
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(workspace)).mockResolvedValueOnce(Response.json({ appliedIds: ['m'] })).mockResolvedValueOnce(new Response(null, { status: 502 }))
    await expect(synchronizeDesktopWorkspace(scope)).rejects.toMatchObject({ phase: 'reconciliation_pull', httpStatus: 502 })
    expect(repository.acknowledgeLocalOutbox).toHaveBeenCalledWith(scope, ['m'])
    expect(repository.replaceLocalWorkspace).not.toHaveBeenCalled()
  })
  it('distinguishes network push failure from auth and catalog failures', async () => {
    vi.mocked(repository.loadLocalOutbox).mockResolvedValueOnce([{ mutationId: 'm', kind: 'client.update', payload: {}, createdAt: '2026-09-07T00:00:00Z' } as repository.LocalOutboxMutation])
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(workspace)).mockRejectedValueOnce(new TypeError('secret URL'))
    await expect(synchronizeDesktopWorkspace(scope)).rejects.toMatchObject({ phase: 'outbox_push', errorType: 'network' })
    expect(repository.failLocalOutboxMutation).toHaveBeenCalledWith(scope, 'm', 'Yerel değişiklikler gönderilemedi.')
  })
  it.each([
    ['offline', 'Çevrimdışı'], ['syncing', 'Eşitleniyor'], ['current', 'Güncel'], ['pending_retry', 'Eşitleme yeniden denenecek'], ['auth_required', 'Oturum yenilenmeli'], ['error', 'Eşitleme hatası'],
  ] as const)('maps %s independently', (state, label) => expect(coreSyncLabel(state, 0)).toBe(label))
})
