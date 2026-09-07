import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Cloud, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react'
import { cloudUrl } from '@/lib/cloud-origin'
import { getCachedNativeSessionToken } from '@/lib/native-shell'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SyncPhaseError, syncFetchJson, syncPhase, type SyncDiagnostic, type SyncPhase } from './sync-diagnostics'
import { acknowledgeLocalOutbox, failLocalOutboxMutation, loadLocalOutbox, loadLocalOutboxStatus, replaceLocalWorkspace, synchronizeLocalFoodCatalog, synchronizeLocalClinicalCatalog, type DesktopLocalScope, type DesktopWorkspacePayload, type LocalOutboxStatus } from './native-workspace-repository'

export type DesktopSyncStatus = 'offline' | 'syncing' | 'current' | 'pending_retry' | 'auth_required' | 'error'
export interface CatalogHealth { status: 'current' | 'updating' | 'stale' | 'retrying' | 'error'; diagnostic: SyncDiagnostic | null; lastSuccessAt: string | null }
interface SyncContextValue {
  status: DesktopSyncStatus; error: string | null; diagnostic: SyncDiagnostic | null
  pendingCount: number; lastSuccessAt: string | null; nextRetryAt: string | null
  catalogs: Record<'food' | 'clinical', CatalogHealth>; syncNow: () => Promise<void>
}
interface SyncResponse { appliedIds?: string[]; failedMutationId?: string; error?: string }
export function outboxToSyncMutation(mutation: { mutationId: string; kind: string; payload: Record<string, unknown>; createdAt: string }) {
  return { id: mutation.mutationId, kind: mutation.kind, payload: mutation.payload, createdAt: mutation.createdAt }
}
const SyncContext = createContext<SyncContextValue | null>(null)
const SYNC_INTERVAL_MS = 30_000
const EMPTY_CATALOG: CatalogHealth = { status: 'stale', diagnostic: null, lastSuccessAt: null }
function bearerHeaders(json = false): HeadersInit {
  const token = getCachedNativeSessionToken()
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
export function assertWorkspaceScope(scope: DesktopLocalScope, workspace: DesktopWorkspacePayload): void {
  if (!workspace.scope || workspace.scope.userId !== scope.userId || workspace.scope.clinicId !== scope.clinicId || workspace.scope.role !== scope.role) {
    const error = new SyncPhaseError('auth', 403, 'scope_mismatch')
    error.message = 'Bulut oturumu açık yerel profil ile eşleşmiyor. Yeniden giriş yapın.'
    throw error
  }
}
async function fetchScopedWorkspace(scope: DesktopLocalScope, phase: SyncPhase): Promise<DesktopWorkspacePayload> {
  const workspace = await syncFetchJson<DesktopWorkspacePayload>(phase, cloudUrl('/api/desktop/workspace'), { cache: 'no-store', credentials: 'include', headers: bearerHeaders() })
  assertWorkspaceScope(scope, workspace)
  return workspace
}

// Catalog maintenance is intentionally absent: core completion is authoritative
// scope validation, durable outbox receipts and a reconciled workspace only.
export async function synchronizeDesktopWorkspace(scope: DesktopLocalScope): Promise<LocalOutboxStatus> {
  let workspace = await fetchScopedWorkspace(scope, 'workspace_pull')
  let pushed = false
  for (let batch = 0; batch < 10; batch += 1) {
    const outbox = await syncPhase('outbox_push', () => loadLocalOutbox(scope))
    if (!outbox.length) break
    try {
      const result = await syncFetchJson<SyncResponse>('outbox_push', cloudUrl('/api/desktop/workspace'), {
        method: 'POST', credentials: 'include', headers: bearerHeaders(true),
        body: JSON.stringify({ mutations: outbox.map(outboxToSyncMutation) }),
      })
      if (result.appliedIds?.length) await syncPhase('outbox_push', () => acknowledgeLocalOutbox(scope, result.appliedIds!))
      if (result.failedMutationId) {
        const error = new SyncPhaseError('outbox_push', 422, 'mutation_rejected')
        await failLocalOutboxMutation(scope, result.failedMutationId, error.message)
        throw error
      }
      if (!result.appliedIds?.length) throw new SyncPhaseError('outbox_push', 200, 'invalid_receipt')
      pushed = true
    } catch (reason) {
      const error = reason instanceof SyncPhaseError ? reason : new SyncPhaseError('outbox_push', null, 'operation')
      if (error.errorType !== 'mutation_rejected') await failLocalOutboxMutation(scope, outbox[0]!.mutationId, error.message)
      throw error
    }
  }
  const pending = await syncPhase('outbox_push', () => loadLocalOutboxStatus(scope))
  // Deferred/backoff mutations are absent from loadLocalOutbox. Never call a
  // snapshot current or try replacing it while ANY durable work is outstanding.
  if (pending.pendingCount > 0) return pending
  if (pushed) workspace = await fetchScopedWorkspace(scope, 'reconciliation_pull')
  try { await syncPhase('reconciliation_pull', () => replaceLocalWorkspace(scope, workspace)) }
  catch (error) {
    const raced = await loadLocalOutboxStatus(scope)
    if (raced.pendingCount > 0) return raced
    throw error
  }
  return pending
}

export async function synchronizeCatalogs(onResult: (key: 'food' | 'clinical', error: SyncPhaseError | null) => void): Promise<void> {
  await Promise.allSettled((['food', 'clinical'] as const).map(async (key) => {
    try {
      await (key === 'food' ? synchronizeLocalFoodCatalog() : synchronizeLocalClinicalCatalog())
      onResult(key, null)
    } catch (reason) {
      onResult(key, reason instanceof SyncPhaseError ? reason : new SyncPhaseError(key === 'food' ? 'food_catalog_version' : 'clinical_catalog_version', null, 'operation'))
    }
  }))
}

export function coreSyncLabel(status: DesktopSyncStatus, pendingCount: number): string {
  if (status === 'offline') return 'Çevrimdışı'
  if (status === 'auth_required') return 'Oturum yenilenmeli'
  if (status === 'syncing') return 'Eşitleniyor'
  if (status === 'error') return 'Eşitleme hatası'
  if (pendingCount > 0) return `${pendingCount} değişiklik bekliyor`
  if (status === 'pending_retry') return 'Eşitleme yeniden denenecek'
  return 'Güncel'
}

export function DesktopSyncProvider({ scope, children }: { scope: DesktopLocalScope; children: React.ReactNode }) {
  const [status, setStatus] = useState<DesktopSyncStatus>(navigator.onLine ? 'syncing' : 'offline')
  const [diagnostic, setDiagnostic] = useState<SyncDiagnostic | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null)
  const [nextRetryAt, setNextRetryAt] = useState<string | null>(null)
  const [catalogs, setCatalogs] = useState({ food: EMPTY_CATALOG, clinical: EMPTY_CATALOG })
  const active = useRef<Promise<void> | null>(null)
  const catalogActive = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const failures = useRef(0)
  const lastCycle = useRef(0)

  const syncNow = useCallback(() => {
    if (!navigator.onLine) { setStatus('offline'); return Promise.resolve() }
    if (active.current) return active.current
    setStatus('syncing')
    setDiagnostic(null)
    const operation = synchronizeDesktopWorkspace(scope).then((outbox) => {
      if (!mounted.current) return
      lastCycle.current = Date.now()
      setPendingCount(outbox.pendingCount)
      setNextRetryAt(outbox.nextRetryAt)
      setStatus(outbox.blockedCount ? 'error' : outbox.pendingCount ? 'pending_retry' : 'current')
      if (!outbox.pendingCount) { setLastSuccessAt(new Date().toISOString()); failures.current = 0 }
    }).catch(async (reason: unknown) => {
      if (!mounted.current) return
      const error = reason instanceof SyncPhaseError ? reason : new SyncPhaseError('workspace_pull', null, 'operation')
      const outbox = await loadLocalOutboxStatus(scope).catch(() => null)
      if (!mounted.current) return
      if (outbox) setPendingCount(outbox.pendingCount)
      failures.current += 1
      const retryAt = error.retryable ? outbox?.nextRetryAt ?? new Date(Date.now() + Math.min(300_000, 2_000 * 2 ** Math.min(failures.current, 7))).toISOString() : null
      setDiagnostic(error.diagnostic(retryAt)); setNextRetryAt(retryAt)
      setStatus(!navigator.onLine ? 'offline' : error.phase === 'auth' ? 'auth_required' : error.retryable ? 'pending_retry' : 'error')
    }).finally(() => { active.current = null })
    active.current = operation
    // Run independently and report each catalog; retained SQLite data remains
    // searchable even when a version/download request fails.
    if (!catalogActive.current) {
      setCatalogs((previous) => ({ food: { ...previous.food, status: 'updating' }, clinical: { ...previous.clinical, status: 'updating' } }))
      catalogActive.current = synchronizeCatalogs((key, error) => {
        if (!mounted.current) return
        setCatalogs((previous) => ({ ...previous, [key]: error
          ? { ...previous[key], status: error.retryable ? 'retrying' : 'error', diagnostic: error.diagnostic(new Date(Date.now() + SYNC_INTERVAL_MS).toISOString()) }
          : { status: 'current', diagnostic: null, lastSuccessAt: new Date().toISOString() } }))
      }).finally(() => { catalogActive.current = null })
    }
    return operation
  }, [scope])

  useEffect(() => {
    mounted.current = true
    const online = () => void syncNow()
    const offline = () => { setStatus('offline'); void loadLocalOutboxStatus(scope).then((row) => { if (mounted.current) setPendingCount(row.pendingCount) }).catch(() => undefined) }
    const mutation = (event: Event) => {
      if ((event as CustomEvent).detail?.source !== 'mutation') return
      // A mutation made during a running pull/push needs a subsequent pass.
      if (active.current) void active.current.then(() => navigator.onLine ? syncNow() : offline())
      else if (navigator.onLine) void syncNow()
      else offline()
    }
    const focus = () => { if (Date.now() - lastCycle.current >= SYNC_INTERVAL_MS) void syncNow() }
    const visibility = () => { if (document.visibilityState === 'visible') focus() }
    void syncNow()
    if (!navigator.onLine) offline()
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    window.addEventListener('focus', focus); window.addEventListener('ogun-local-data-changed', mutation)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      mounted.current = false
      window.removeEventListener('online', online); window.removeEventListener('offline', offline)
      window.removeEventListener('focus', focus); window.removeEventListener('ogun-local-data-changed', mutation)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [scope, syncNow])
  useEffect(() => {
    if (status === 'auth_required' || status === 'offline' || status === 'syncing') return
    const delay = nextRetryAt ? Math.max(1_000, Date.parse(nextRetryAt) - Date.now()) : SYNC_INTERVAL_MS
    const timer = window.setTimeout(() => void syncNow(), delay)
    return () => window.clearTimeout(timer)
  }, [status, nextRetryAt, lastSuccessAt, syncNow])

  return <SyncContext.Provider value={{ status, error: diagnostic?.message ?? null, diagnostic, pendingCount, lastSuccessAt, nextRetryAt, catalogs, syncNow }}>{children}</SyncContext.Provider>
}
export function useDesktopSync(): SyncContextValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('useDesktopSync, DesktopSyncProvider içinde kullanılmalıdır.')
  return value
}
export function DesktopSyncIndicator() {
  const state = useDesktopSync()
  const { status, pendingCount, catalogs, diagnostic, lastSuccessAt, nextRetryAt, syncNow } = state
  const label = coreSyncLabel(status, pendingCount)
  const warning = Object.values(catalogs).some((catalog) => ['error', 'retrying', 'stale'].includes(catalog.status))
  const Icon = status === 'syncing' ? LoaderCircle : status === 'offline' ? CloudOff : status === 'error' || status === 'auth_required' ? TriangleAlert : Cloud
  const time = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : '—'
  const catalogLabels = { current: 'Güncel', updating: 'Güncelleniyor', stale: 'Güncelleme bekliyor', retrying: 'Yeniden denenecek', error: 'Güncellenemedi' }
  return <Popover><PopoverTrigger asChild><button type="button" data-sync-status={status} className="fixed right-4 bottom-4 z-50 flex flex-col items-start gap-1 rounded-xl border bg-background px-3 py-2 text-xs font-medium shadow-lg">
    <span className="flex items-center gap-2"><Icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} /><span>{label}</span></span>
    {warning ? <span data-catalog-warning className="text-amber-700 dark:text-amber-400">Katalog güncellemesi bekliyor</span> : null}
  </button></PopoverTrigger><PopoverContent align="end" className="w-80 space-y-3 text-sm" data-sync-details>
    <p className="font-semibold">{label}</p><p>Son başarılı eşitleme: {time(lastSuccessAt)}</p><p>Bekleyen değişiklik: {pendingCount}</p>
    {diagnostic ? <p>Faz: {diagnostic.phase}{diagnostic.httpStatus ? ` · HTTP ${diagnostic.httpStatus}` : ''}<br />{diagnostic.message}</p> : null}
    {nextRetryAt ? <p>Yeniden deneme: {time(nextRetryAt)}</p> : null}
    {(['food', 'clinical'] as const).map((key) => <div key={key}><p>{key === 'food' ? 'Besin kataloğu' : 'Klinik katalog'}: {catalogLabels[catalogs[key].status]}</p>{catalogs[key].diagnostic ? <p className="text-xs text-muted-foreground">{catalogs[key].diagnostic.phase} · {catalogs[key].diagnostic.httpStatus ?? catalogs[key].diagnostic.errorType}</p> : null}</div>)}
    <Button size="sm" variant="outline" disabled={status === 'offline' || status === 'syncing'} onClick={() => void syncNow()}>Yeniden dene</Button>
  </PopoverContent></Popover>
}
