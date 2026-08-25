'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isNativeShell } from '@/lib/native-shell'

export type DesktopWindowAction = 'minimize' | 'toggleMaximize' | 'close'

const INTERACTIVE_SELECTOR = 'button, a, input, [role="button"], [role="menuitem"]'

// Windows varsayılan çift tık eşiği (GetDoubleClickTime ≈ 500 ms) ve
// SM_CXDOUBLECLK (~4 px) ile uyumlu toleranslar.
const DOUBLE_CLICK_TIME_MS = 500
const DOUBLE_CLICK_DISTANCE_PX = 5

function isInteractiveTarget(target: EventTarget): boolean {
  // DİKKAT: Element — HTMLElement DEĞİL. Pencere tuşlarındaki lucide
  // ikonları <svg> elementleridir ve SVGElement, HTMLElement'in alt sınıfı
  // DEĞİLDİR. Eski `instanceof HTMLElement` denetimi ikonun üstüne doğrudan
  // basışı "boşluk" sayıyordu; başlık çubuğu o basışta native sürüklemeyi
  // başlatıyor ve OS'un modal taşıma döngüsü mouseup/click'i yuttuğu için
  // tuşun onClick'i hiç tetiklenmiyordu (kullanıcı raporu: "küçült/büyüt/
  // kapat bazen çalışmıyor").
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}

export function useDesktopWindowControls(enabled = true) {
  const [maximized, setMaximized] = useState(false)
  const lastTitlebarPressRef = useRef<{ time: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!enabled || !isNativeShell()) return

    document.documentElement.dataset.nativeShell = 'true'
    void invoke<boolean>('control_main_window', { action: 'isMaximized' })
      .then(setMaximized)
      .catch((error) => console.error('[desktop-titlebar] pencere durumu okunamadı', error))
  }, [enabled])

  async function withWindow(action: DesktopWindowAction) {
    try {
      setMaximized(await invoke<boolean>('control_main_window', { action }))
    } catch (error) {
      console.error(`[desktop-titlebar] ${action} işlemi başarısız`, error)
    }
  }

  async function startDragging() {
    try {
      await invoke('control_main_window', { action: 'startDragging' })
    } catch (error) {
      console.error('[desktop-titlebar] pencere sürüklenemedi', error)
    }
  }

  const titlebarHandlers = {
    onMouseDown(event: MouseEvent<HTMLElement>) {
      if (event.button !== 0 || isInteractiveTarget(event.target)) return
      const now = performance.now()
      const previous = lastTitlebarPressRef.current
      lastTitlebarPressRef.current = { time: now, x: event.clientX, y: event.clientY }
      // Çift tıkı KENDİMİZ algılıyoruz (kullanıcı raporu: "boşluğa çift
      // tıklayınca tam ekran olmuyor"): ilk basışta başlatılan native
      // sürükleme modal bir taşıma döngüsüne girer ve tarayıcının click/
      // dblclick zincirini yuttuğu için DOM dblclick olayı güvenilir şekilde
      // hiç ulaşmaz. İkinci hızlı basışı sürüklemeyi BAŞLATMADAN yakalayıp
      // büyüt/döndür yapıyoruz.
      if (
        previous &&
        now - previous.time <= DOUBLE_CLICK_TIME_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <=
          DOUBLE_CLICK_DISTANCE_PX
      ) {
        lastTitlebarPressRef.current = null
        void withWindow('toggleMaximize')
        return
      }
      // İlk basışta native sürüklemeyi başlat. MouseMove eşiğini beklemek,
      // hızlı imleçte olayın webview dışına kaçmasına yol açıyordu.
      void startDragging()
    },
  }

  return { maximized, titlebarHandlers, withWindow }
}
