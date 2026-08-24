'use client'

import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isNativeShell } from '@/lib/native-shell'

const STARTUP_PRELOAD_TIMEOUT_MS = 15_000

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Windows başlangıcında gizli açılan native kabuğu, hafif besin kataloğu
 * hazır olduğunda gösterir. Normal web ziyaretleri ve kullanıcı tarafından
 * başlatılan desktop açılışları için tamamen no-op'tur.
 */
export function DesktopStartupBridge() {
  useEffect(() => {
    if (!isNativeShell()) return

    void invoke<boolean>('is_autostart_launch')
      .then(async (autostartLaunch) => {
        if (!autostartLaunch) return

        // Ağ çok yavaşsa pencere sonsuza kadar görünmez kalmasın. İndeks
        // hazırlığı zaman aşımından sonra da arka planda güvenle sürebilir.
        await Promise.race([
          import('@/lib/food-index').then(({ initFoodIndex }) => initFoodIndex()),
          timeout(STARTUP_PRELOAD_TIMEOUT_MS),
        ]).catch((error: unknown) => {
          console.warn('[desktop-startup] besin kataloğu ön hazırlığı tamamlanamadı', error)
        })
        await invoke('complete_startup_launch')
      })
      .catch((error: unknown) => {
        console.warn('[desktop-startup] başlangıç durumu okunamadı', error)
      })
  }, [])

  return null
}
