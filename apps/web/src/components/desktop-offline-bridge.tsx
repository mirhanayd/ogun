'use client'

import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  remainingOfflineMutations,
  type DesktopOfflineMutation,
  type DesktopOfflineProfile,
  type DesktopSyncResult,
} from '@/lib/desktop-offline'
import { getCachedNativeSessionToken, isNativeShell } from '@/lib/native-shell'

interface DesktopOfflineBridgeProps {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
  role: string
}

function authHeaders(): HeadersInit {
  const token = getCachedNativeSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function DesktopOfflineBridge(props: DesktopOfflineBridgeProps) {
  const [needsPin, setNeedsPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pinAgain, setPinAgain] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  const refreshSnapshot = useCallback(async () => {
    const response = await fetch('/api/desktop/workspace', {
      cache: 'no-store',
      credentials: 'include',
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error('Çevrimdışı çalışma alanı güncellenemedi.')
    const workspace = await response.json()
    const syncedAt = new Date().toISOString()
    await invoke('save_offline_workspace', { userId: props.userId, workspace })
    await invoke('upsert_offline_profile', {
      profile: {
        userId: props.userId,
        email: props.email,
        displayName: props.displayName,
        clinicId: props.clinicId,
        clinicName: props.clinicName,
        role: props.role,
        lastSyncedAt: syncedAt,
      },
    })
  }, [props.clinicId, props.clinicName, props.displayName, props.email, props.role, props.userId])

  const synchronize = useCallback(async () => {
    const pending = await invoke<DesktopOfflineMutation[]>('load_pending_offline_mutations', {
      userId: props.userId,
    })
    if (pending.length === 0) {
      await refreshSnapshot()
      return
    }

    const response = await fetch('/api/desktop/workspace', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mutations: pending }),
    })
    if (!response.ok) throw new Error('Çevrimdışı değişiklikler gönderilemedi.')
    const result = (await response.json()) as DesktopSyncResult
    const remaining = remainingOfflineMutations(pending, result)

    // Başarılı kayıtları önce kasadan kaldır. Bir sonraki kayıtta yerel bir
    // kimliğe referans varsa sunucunun döndürdüğü gerçek kimlikle üzerine yaz.
    if (result.appliedIds.length > 0) {
      await invoke('acknowledge_offline_mutations', {
        userId: props.userId,
        mutationIds: result.appliedIds,
      })
    }
    for (const mutation of remaining) {
      await invoke('queue_offline_mutation', { userId: props.userId, mutation })
    }

    if (remaining.length === 0) {
      await refreshSnapshot()
      toast.success('Çevrimdışı değişiklikler bulutla eşitlendi.')
    } else if (result.error) {
      toast.error('Bazı çevrimdışı kayıtlar beklemede.', { description: result.error })
    }
  }, [props.userId, refreshSnapshot])

  useEffect(() => {
    if (!isNativeShell()) return
    let cancelled = false

    void (async () => {
      await invoke('upsert_offline_profile', {
        profile: {
          userId: props.userId,
          email: props.email,
          displayName: props.displayName,
          clinicId: props.clinicId,
          clinicName: props.clinicName,
          role: props.role,
          lastSyncedAt: null,
        },
      })
      const profiles = await invoke<DesktopOfflineProfile[]>('list_offline_profiles')
      const deviceProfile = profiles.find((profile) => profile.userId === props.userId)
      if (!cancelled) setNeedsPin(deviceProfile?.pinConfigured === false)
      await synchronize()
    })().catch((error) => {
      console.warn('[desktop-offline] cihaz çalışma alanı hazırlanamadı', error)
    })

    const onOnline = () =>
      void synchronize().catch((error) => {
        console.warn('[desktop-offline] yeniden eşitleme başarısız', error)
      })
    let queuedTimer: number | undefined
    const onMutationQueued = () => {
      window.clearTimeout(queuedTimer)
      queuedTimer = window.setTimeout(onOnline, 900)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('ogun-offline-mutation-queued', onMutationQueued)
    return () => {
      cancelled = true
      window.clearTimeout(queuedTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('ogun-offline-mutation-queued', onMutationQueued)
    }
  }, [
    props.clinicId,
    props.clinicName,
    props.displayName,
    props.email,
    props.role,
    props.userId,
    synchronize,
  ])

  if (!needsPin) return null

  async function savePin() {
    setPinError(null)
    if (!/^\d{4,8}$/.test(pin)) {
      setPinError('PIN 4-8 rakamdan oluşmalıdır.')
      return
    }
    if (pin !== pinAgain) {
      setPinError('Girdiğiniz PIN’ler eşleşmiyor.')
      return
    }
    setSavingPin(true)
    try {
      await invoke('configure_offline_pin', {
        userId: props.userId,
        newPin: pin,
        currentPin: null,
      })
      setNeedsPin(false)
      toast.success('Çevrimdışı giriş PIN’i hazır.')
    } catch (error) {
      setPinError(String(error))
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/45 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 shadow-2xl sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <ShieldCheck className="size-5" />
        </span>
        <p className="mt-5 text-xs font-bold tracking-[0.14em] text-primary uppercase">
          Cihaz güvenliği
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
          İnternet olmadan giriş için PIN belirleyin
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Bu PIN yalnızca bu bilgisayarda çalışır. Klinik veriniz ve bekleyen değişiklikler şifreli
          cihaz kasasında tutulur.
        </p>
        <div className="mt-6 grid gap-3">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="4-8 rakamlı PIN"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <Input
            value={pinAgain}
            onChange={(event) => setPinAgain(event.target.value.replace(/\D/g, '').slice(0, 8))}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="PIN’i tekrar girin"
            className="h-11 rounded-xl"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void savePin()
            }}
          />
        </div>
        {pinError ? <p className="mt-3 text-sm text-destructive">{pinError}</p> : null}
        <Button className="mt-5 h-11 w-full rounded-xl" disabled={savingPin} onClick={savePin}>
          {savingPin ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          {savingPin ? 'PIN kaydediliyor…' : 'PIN’i kaydet ve devam et'}
        </Button>
      </div>
    </div>
  )
}
