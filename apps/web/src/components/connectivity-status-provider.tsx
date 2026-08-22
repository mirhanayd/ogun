'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type ConnectivityStatus = 'checking' | 'online' | 'offline'

const ConnectivityStatusContext = createContext<ConnectivityStatus>('checking')
const CHECK_INTERVAL_MS = 30_000
const CHECK_TIMEOUT_MS = 4_000

export function ConnectivityStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectivityStatus>('checking')

  useEffect(() => {
    let disposed = false
    let activeController: AbortController | null = null

    async function checkConnectivity() {
      activeController?.abort()

      if (!navigator.onLine) {
        setStatus('offline')
        return
      }

      const controller = new AbortController()
      activeController = controller
      const timeout = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)

      try {
        const response = await fetch('/api/connectivity', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!disposed && activeController === controller) {
          setStatus(response.ok ? 'online' : 'offline')
        }
      } catch {
        if (!disposed && activeController === controller) setStatus('offline')
      } finally {
        window.clearTimeout(timeout)
        if (activeController === controller) activeController = null
      }
    }

    function handleOffline() {
      activeController?.abort()
      setStatus('offline')
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void checkConnectivity()
    }

    void checkConnectivity()
    const interval = window.setInterval(() => void checkConnectivity(), CHECK_INTERVAL_MS)
    window.addEventListener('online', checkConnectivity)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', checkConnectivity)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      activeController?.abort()
      window.clearInterval(interval)
      window.removeEventListener('online', checkConnectivity)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', checkConnectivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <ConnectivityStatusContext.Provider value={status}>
      {children}
    </ConnectivityStatusContext.Provider>
  )
}

export function useConnectivityStatus(): ConnectivityStatus {
  return useContext(ConnectivityStatusContext)
}
