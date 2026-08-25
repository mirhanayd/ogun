'use client'

import { useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
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

    // Profil kaydı ERTELMEZ, mount'ta HEMEN yazılır. Ayarlar'daki hızlı
    // giriş PIN'i bu kayda bağımlıdır (bkz. offline_vault.rs
    // configure_offline_pin): kaydı da ertelersek kullanıcı girişten hemen
    // sonra PIN oluşturmaya çalışınca "Bu cihazda kayıtlı hesap bulunamadı."
    // hatası görür (0.2.6 gerileme raporu). İşlem ucuzdur — komutlar artık
    // ana iş parçacığını bloklamadığı için kasma yaratmaz.
    void invoke('upsert_offline_profile', {
      profile: {
        userId: props.userId,
        email: props.email,
        displayName: props.displayName,
        clinicId: props.clinicId,
        clinicName: props.clinicName,
        role: props.role,
        lastSyncedAt: null,
      },
    }).catch((error) => {
      console.warn('[desktop-offline] cihaz profili kaydedilemedi', error)
      // Sessiz kalma: PIN oluşturma bu kayda bağlıdır; başarısızlık nedenini
      // kullanıcı görsün (tanı için).
      if (!cancelled) {
        toast.error('Cihaz hesabı kaydedilemedi.', { description: String(error) })
      }
    })

    // PERFORMANS (kullanıcı raporu: "giriş yaptıktan sonra arayüz kasıyor"):
    // ASIL AĞIR iş olan tam çalışma alanı indirme + kasaya yazma ilk
    // boyama/hidrasyon ile AYNI anda başlamasın — tarayıcıya boşta kaldığında
    // soruyoruz (desteklemeyenlerde kısa zaman aşımı). Olay kaynaklı
    // eşitlemeler (online/mutation) aşağıda olduğu gibi anında kalır.
    const idleId =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => {
            if (!cancelled) void runDeferredSync()
          })
        : window.setTimeout(() => {
            if (!cancelled) void runDeferredSync()
          }, 1_500)

    function runDeferredSync() {
      void (async () => {
        const profiles = await invoke<DesktopOfflineProfile[]>('list_offline_profiles')
        const deviceProfile = profiles.find((profile) => profile.userId === props.userId)
        if (!cancelled && deviceProfile?.pinConfigured === false) {
          // PIN hızlı giriş için isteğe bağlıdır; normal uygulamayı örten zorunlu
          // bir "offline moda geçiş" ekranı değildir. Kullanıcı aynı arayüzde
          // çalışmaya devam eder, dilerse Ayarlar'dan PIN oluşturur.
          toast.info('Bu cihaz için hızlı giriş PIN’i ayarlayabilirsiniz.', {
            id: 'desktop-quick-login-pin',
            description: 'PIN isteğe bağlıdır ve yalnızca kayıtlı hesabın kilidini açar.',
            duration: 12_000,
            action: {
              label: 'Ayarlara git',
              onClick: () => window.location.assign('/ayarlar'),
            },
          })
        }
        await synchronize()
      })().catch((error) => {
        console.warn('[desktop-offline] cihaz çalışma alanı hazırlanamadı', error)
      })
    }

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
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId as number)
      else window.clearTimeout(idleId as number)
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

  return null
}
