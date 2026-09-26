'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

const PREFERENCE_KEY = 'ogun.sidebar.collapsed.v1'

export function AppSidebar({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const id = useId()
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(PREFERENCE_KEY) === 'true') } catch { /* Storage can be unavailable in private sessions. */ }
  }, [])

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(PREFERENCE_KEY, String(next)) } catch { /* Keep the control usable without persistence. */ }
  }

  return <aside className="app-sidebar hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex" data-app-sidebar data-collapsed={collapsed}>
    <div id={id} className="flex min-h-0 flex-1 flex-col">{children}</div>
    <button type="button" className="sidebar-toggle flex min-h-11 items-center gap-3 border-t border-sidebar-border px-6 text-sm text-sidebar-foreground hover:bg-sidebar-accent" onClick={toggle} aria-expanded={!collapsed} aria-controls={id} aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'} title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}>
      {collapsed ? <PanelLeftOpen className="size-5 shrink-0" aria-hidden="true" /> : <PanelLeftClose className="size-5 shrink-0" aria-hidden="true" />}
      <span className="sidebar-label">Menüyü daralt</span>
    </button>
  </aside>
}
