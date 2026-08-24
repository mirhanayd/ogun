'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isNativeShell } from '@/lib/native-shell'

export type DesktopWindowAction = 'minimize' | 'toggleMaximize' | 'close'

const INTERACTIVE_SELECTOR = 'button, a, input, [role="button"], [role="menuitem"]'

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SELECTOR) !== null
}

export function useDesktopWindowControls(enabled = true) {
  const [maximized, setMaximized] = useState(false)

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
      // İlk basışta native sürüklemeyi başlat. MouseMove eşiğini beklemek,
      // hızlı imleçte olayın webview dışına kaçmasına yol açıyordu.
      void startDragging()
    },
    onDoubleClick(event: MouseEvent<HTMLElement>) {
      if (isInteractiveTarget(event.target)) return
      void withWindow('toggleMaximize')
    },
  }

  return { maximized, titlebarHandlers, withWindow }
}
