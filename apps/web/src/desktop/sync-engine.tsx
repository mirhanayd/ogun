import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Cloud, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react'
import { cloudUrl } from '@/lib/cloud-origin'
import { getCachedNativeSessionToken } from '@/lib/native-shell'
import { cn } from '@/lib/utils'
import {
  acknowledgeLocalOutbox,
  failLocalOutboxMutation,
  loadLocalOutbox,
  replaceLocalWorkspace,
  synchronizeLocalFoodCatalog,
  type DesktopLocalScope,
  type DesktopWorkspacePayload,
} from './native-workspace-repository'

export type DesktopSyncStatus = 'offline' | 'syncing' | 'current' | 'error'

interface SyncContextValue {
  status: DesktopSyncStatus
  error: string | null
  syncNow: () => Promise<void>
}

interface SyncResponse {
  appliedIds?: string[]
  failedMutationId?: string
  error?: string
}

export function outboxToSyncMutation(mutation: {
  mutationId: string
  kind: string
  payload: Record<string, unknown>
  createdAt: string
}) {
  return {
    id: mutation.mutationId,
    kind: mutation.kind,
    payload: mutation.payload,
    createdAt: mutation.createdAt,
  }
}

const SyncContext = createContext<SyncContextValue | null>(null)
const SYNC_INTERVAL_MS = 30_000

function bearerHeaders(json = false): HeadersInit {
  const token = getCachedNativeSessionToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? `Senkronizasyon isteği başarısız (${response.status}).`
}

export async function synchronizeDesktopWorkspace(scope: DesktopLocalScope): Promise<void> {
  const outbox = await loadLocalOutbox(scope)
  if (outbox.length > 0) {
    let response: Response
    try {
      response = await fetch(cloudUrl('/api/desktop/workspace'), {
        method: 'POST',
        credentials: 'include',
        headers: bearerHeaders(true),
        body: JSON.stringify({
          mutations: outbox.map(outboxToSyncMutation),
        }),
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Sunucuya ulaşılamadı.'
      await failLocalOutboxMutation(scope, outbox[0]!.mutationId, message)
      throw new Error(message)
    }

    if (!response.ok) {
      const message = await responseError(response)
      await failLocalOutboxMutation(scope, outbox[0]!.mutationId, message)
      throw new Error(message)
    }

    const result = (await response.json()) as SyncResponse
    if (result.appliedIds?.length) await acknowledgeLocalOutbox(scope, result.appliedIds)
    if (result.failedMutationId) {
      const message = result.error ?? 'Yerel değişiklik sunucuda uygulanamadı.'
      await failLocalOutboxMutation(scope, result.failedMutationId, message)
      throw new Error(message)
    }
  }

  const response = await fetch(cloudUrl('/api/desktop/workspace'), {
    cache: 'no-store',
    credentials: 'include',
    headers: bearerHeaders(),
  })
  if (!response.ok) throw new Error(await responseError(response))
  await replaceLocalWorkspace(scope, (await response.json()) as DesktopWorkspacePayload)
  await synchronizeLocalFoodCatalog()
}

export function DesktopSyncProvider({
  scope,
  children,
}: {
  scope: DesktopLocalScope
  children: React.ReactNode
}) {
  const [status, setStatus] = useState<DesktopSyncStatus>(navigator.onLine ? 'syncing' : 'offline')
  const [error, setError] = useState<string | null>(null)
  const active = useRef<Promise<void> | null>(null)

  const syncNow = useCallback(() => {
    if (!navigator.onLine) {
      setStatus('offline')
      return Promise.resolve()
    }
    if (active.current) return active.current

    setStatus('syncing')
    setError(null)
    const operation = synchronizeDesktopWorkspace(scope)
      .then(() => setStatus('current'))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus(navigator.onLine ? 'error' : 'offline')
      })
      .finally(() => {
        active.current = null
      })
    active.current = operation
    return operation
  }, [scope])

  useEffect(() => {
    const handleOnline = () => void syncNow()
    const handleOffline = () => setStatus('offline')
    const handleFocus = () => void syncNow()
    const handleLocalMutation = () => {
      if (navigator.onLine) void syncNow()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }

    void syncNow()
    const interval = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('ogun-local-data-changed', handleLocalMutation)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('ogun-local-data-changed', handleLocalMutation)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [syncNow])

  return <SyncContext.Provider value={{ status, error, syncNow }}>{children}</SyncContext.Provider>
}

export function useDesktopSync(): SyncContextValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('useDesktopSync, DesktopSyncProvider içinde kullanılmalıdır.')
  return value
}

export function DesktopSyncIndicator() {
  const { status, error, syncNow } = useDesktopSync()
  const Icon =
    status === 'syncing'
      ? LoaderCircle
      : status === 'offline'
        ? CloudOff
        : status === 'error'
          ? TriangleAlert
          : Cloud
  const label =
    status === 'syncing'
      ? 'Eşitleniyor…'
      : status === 'offline'
        ? 'Çevrimdışı · cihazda kayıtlı'
        : status === 'error'
          ? 'Eşitleme bekliyor'
          : 'Güncel'
  return (
    <button
      type="button"
      title={error ?? label}
      onClick={() => void syncNow()}
      className={cn(
        'fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg',
        status === 'error' && 'border-destructive/40 text-destructive',
      )}
    >
      <Icon className={cn('size-3.5', status === 'syncing' && 'animate-spin')} />
      {label}
    </button>
  )
}
