'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackEvent } from '@/lib/analytics/track'
import { installConsoleBuffer } from '@/lib/monitoring/console-buffer'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "hangi ekranda ne kadar süre"
// usageEvents'in 'screen_view' olayını üretir. Görünmez bir bileşen —
// (app) layout'ta BİR KEZ mount edilir (bkz. layout.tsx), her pathname
// değişiminde ÖNCEKİ sayfada geçirilen süreyi loglar (sendBeacon, bkz.
// lib/analytics/track.ts — sekme kapanırken bile teslim edilme şansı
// fetch'ten yüksek). Son sayfanın süresi (kullanıcı sekmeyi kapatana kadar)
// visibilitychange/pagehide ile de yakalanır — SPA navigasyonu App Router'da
// sayfa yenilemesi TETİKLEMEDİĞİ için beforeunload/pagehide'a GÜVENİLEMEZ
// (Next.js route değişimlerinde bu olaylar ateşlenmez), o yüzden asıl
// mekanizma pathname değişimi.
export function ScreenTimeTracker() {
  const pathname = usePathname()
  const enteredAtRef = useRef(performance.now())
  const previousPathRef = useRef(pathname)

  useEffect(() => {
    installConsoleBuffer()
  }, [])

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      trackEvent({
        eventName: 'screen_view',
        screen: previousPathRef.current,
        durationMs: Math.round(performance.now() - enteredAtRef.current),
      })
      previousPathRef.current = pathname
      enteredAtRef.current = performance.now()
    }
  }, [pathname])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        trackEvent({
          eventName: 'screen_view',
          screen: previousPathRef.current,
          durationMs: Math.round(performance.now() - enteredAtRef.current),
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return null
}
