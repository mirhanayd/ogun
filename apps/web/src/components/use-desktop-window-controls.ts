'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isNativeShell } from '@/lib/native-shell'

export type DesktopWindowAction = 'minimize' | 'toggleMaximize' | 'close'

const INTERACTIVE_SELECTOR = 'button, a, input, [role="button"], [role="menuitem"]'
const DRAG_THRESHOLD_PX = 4

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.closest(INTERACTIVE_SELECTOR) !== null
}

export function useDesktopWindowControls(enabled = true) {
  const [maximized, setMaximized] = useState(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)

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

  function cancelDragCandidate() {
    dragOrigin.current = null
  }

  const titlebarHandlers = {
    onMouseDown(event: MouseEvent<HTMLElement>) {
      if (event.button !== 0 || isInteractiveTarget(event.target)) return
      dragOrigin.current = { x: event.clientX, y: event.clientY }
    },
    onMouseMove(event: MouseEvent<HTMLElement>) {
      const origin = dragOrigin.current
      if (!origin) return
      if ((event.buttons & 1) === 0) {
        cancelDragCandidate()
        return
      }

      const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      if (moved < DRAG_THRESHOLD_PX) return

      cancelDragCandidate()
      void startDragging()
    },
    onMouseUp: cancelDragCandidate,
    onMouseLeave: cancelDragCandidate,
    onDoubleClick(event: MouseEvent<HTMLElement>) {
      cancelDragCandidate()
      if (isInteractiveTarget(event.target)) return
      void withWindow('toggleMaximize')
    },
  }

  return { maximized, titlebarHandlers, withWindow }
}
