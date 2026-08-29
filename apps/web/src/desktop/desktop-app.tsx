import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Leaf, Maximize2, Minus, X } from 'lucide-react'
import { AppShellFrame } from '@/components/app-shell-frame'
import { ConnectivityStatusProvider, useConnectivityStatus } from '@/components/connectivity-status-provider'
import { OfflineIndicator } from '@/components/offline-indicator'
import { cn } from '@/lib/utils'
import { visibleNavItems } from '@/app/(app)/_components/nav-items'

type Route = '/panel' | '/danisanlar' | '/randevular' | '/planlar' | '/tarifler' | '/finans' | '/ayarlar'

function DesktopTitlebar() {
  const control = (action: 'minimize' | 'toggleMaximize' | 'close') =>
    void invoke('control_main_window', { action })

  return (
    <header className="clinic-desktop-titlebar desktop-titlebar relative z-50 flex h-12 shrink-0 select-none items-center border-b">
      <div className="flex w-60 items-center gap-2.5 px-4">
        <span className="grid size-7 place-items-center rounded-lg bg-white/15"><Leaf className="size-4" /></span>
        <span className="text-sm font-semibold">öğün</span>
        <span className="rounded-full border border-current/15 bg-current/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] uppercase">Desktop</span>
      </div>
      <div className="flex-1 text-center text-xs font-medium opacity-75">Yerel çalışma alanı</div>
      <div className="flex h-full border-l border-current/10">
        <button type="button" aria-label="Küçült" onClick={() => control('minimize')} className="grid h-full w-11 place-items-center hover:bg-current/10"><Minus className="size-3.5" /></button>
        <button type="button" aria-label="Büyüt" onClick={() => control('toggleMaximize')} className="grid h-full w-11 place-items-center hover:bg-current/10"><Maximize2 className="size-3.5" /></button>
        <button type="button" aria-label="Kapat" onClick={() => control('close')} className="grid h-full w-11 place-items-center hover:bg-red-500 hover:text-white"><X className="size-3.5" /></button>
      </div>
    </header>
  )
}

function DesktopNavigation({ route, onNavigate }: { route: Route; onNavigate: (route: Route) => void }) {
  const connectivity = useConnectivityStatus()
  return (
    <nav className="flex min-h-0 flex-1 flex-col px-3 pb-4" aria-label="Ana gezinme">
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">Klinik yönetimi</p>
      <div className="flex flex-col gap-1">
        {visibleNavItems('owner').map((item) => {
          const active = route === item.href
          return (
            <button key={item.href} type="button" onClick={() => onNavigate(item.href as Route)} className={cn('group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.82rem] font-medium text-sidebar-foreground/65 transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground', active && 'bg-sidebar-accent text-sidebar-accent-foreground')}>
              <span className={cn('grid size-7 place-items-center rounded-lg text-muted-foreground', active && 'bg-sidebar-primary/10 text-sidebar-primary')}><item.icon className="size-4" /></span>
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="mt-auto rounded-xl border border-sidebar-border bg-background/45 p-3 text-xs">
        {connectivity === 'online' ? 'Güncel' : connectivity === 'offline' ? 'Çevrimdışı' : 'Bağlantı kontrol ediliyor'}
      </div>
    </nav>
  )
}

function DesktopWorkspace() {
  const [route, setRoute] = useState<Route>('/panel')
  const title = useMemo(() => visibleNavItems('owner').find((item) => item.href === route)?.label ?? 'Panel', [route])

  return (
    <AppShellFrame
      clinicName="Öğün"
      clinicInitials="ÖĞ"
      userName="Yerel çalışma alanı"
      desktopTitlebar={<DesktopTitlebar />}
      navigation={<DesktopNavigation route={route} onNavigate={setRoute} />}
      topbar={<header className="app-topbar flex h-[4.5rem] shrink-0 items-center border-b border-border/80 bg-background/90 px-6"><span className="font-semibold">{title}</span></header>}
      bottomNavigation={null}
      overlays={<OfflineIndicator />}
    >
      <div className="grid min-h-80 place-items-center rounded-2xl border border-border/70 bg-card text-center shadow-sm">
        <div><Leaf className="mx-auto mb-3 size-8 text-primary" /><p className="font-semibold">Öğün çalışma alanı hazırlanıyor…</p></div>
      </div>
    </AppShellFrame>
  )
}

export function DesktopApp() {
  return <ConnectivityStatusProvider><DesktopWorkspace /></ConnectivityStatusProvider>
}
