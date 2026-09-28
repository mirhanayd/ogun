'use client'

import { useState, type ComponentType, type HTMLAttributes, type ReactNode } from 'react'
import { Maximize2, Minus, MoreHorizontal, Square, X } from 'lucide-react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { visibleNavItems } from '@/app/(app)/_components/nav-items'

export interface ShellLinkProps {
  href: string
  className?: string
  children: ReactNode
  'aria-current'?: 'page'
  title?: string
  onClick?: () => void
}

export type ShellLinkComponent = ComponentType<ShellLinkProps>

export interface SidebarQuickClient {
  id: string
  firstName: string
  lastName: string
}

function AnchorLink({ href, onClick, ...props }: ShellLinkProps) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (!onClick) return
        event.preventDefault()
        onClick()
      }}
    />
  )
}

export function SidebarNavView({
  role,
  currentPath,
  quickClients,
  loadQuickClients,
  LinkComponent = AnchorLink,
  onNavigate,
}: {
  role: ClinicMemberRole
  currentPath: string
  quickClients?: SidebarQuickClient[]
  loadQuickClients?: () => Promise<SidebarQuickClient[]>
  LinkComponent?: ShellLinkComponent
  onNavigate?: (href: string) => void
}) {
  const items = visibleNavItems(role)
  const [showQuickClients, setShowQuickClients] = useState(false)
  const [loadedQuickClients, setLoadedQuickClients] = useState<SidebarQuickClient[]>([])
  const [quickClientStatus, setQuickClientStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >(quickClients ? 'ready' : 'idle')
  const recentClients = quickClients ?? loadedQuickClients

  function openQuickClients() {
    setShowQuickClients(true)
    if (!loadQuickClients || quickClients || quickClientStatus !== 'idle') return
    setQuickClientStatus('loading')
    void loadQuickClients()
      .then((rows) => {
        setLoadedQuickClients(rows.slice(0, 4))
        setQuickClientStatus('ready')
      })
      .catch(() => setQuickClientStatus('error'))
  }

  const renderItem = (item: (typeof items)[number]) => {
    const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`)
    return (
      <LinkComponent
        key={item.href}
        href={item.href}
        onClick={onNavigate ? () => onNavigate(item.href) : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'sidebar-link group relative flex min-h-12 items-center gap-3 overflow-hidden rounded-xl text-sm font-semibold text-foreground transition-colors hover:bg-sidebar-accent',
          active && 'sidebar-link-active bg-sidebar-accent',
        )}
      >
        <span
          className={cn(
            'sidebar-link-icon grid size-12 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors group-hover:text-foreground',
            active &&
              'rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-sm group-hover:text-sidebar-primary-foreground',
          )}
        >
          <item.icon className="size-[1.45rem] shrink-0" strokeWidth={2.15} aria-hidden="true" />
        </span>
        <span className="sidebar-label whitespace-nowrap pr-4">{item.label}</span>
      </LinkComponent>
    )
  }

  return (
    <nav
      className="sidebar-nav flex min-h-0 flex-col gap-2 overflow-visible"
      aria-label="Ana gezinme"
      data-sidebar-navigation
    >
      <div className="sidebar-panel-action">{items.slice(0, 1).map(renderItem)}</div>
      <div className="sidebar-navigation-stack flex flex-col gap-1" data-sidebar-navigation-items>
        {items.slice(1).map((item) =>
          item.href === '/danisanlar' ? (
            <div
              key={item.href}
              className="sidebar-client-group"
              onMouseEnter={openQuickClients}
              onMouseLeave={() => setShowQuickClients(false)}
              onFocus={openQuickClients}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setShowQuickClients(false)
              }}
            >
              {renderItem(item)}
              {showQuickClients ? (
                <div className="sidebar-client-quick-list" aria-label="Son danışanlar">
                  <p className="sidebar-label px-2 pb-1 pt-2 text-[0.68rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                    Son danışanlar
                  </p>
                  {quickClientStatus === 'loading' ? (
                    <p className="sidebar-label px-2 py-2 text-xs text-muted-foreground">
                      Yükleniyor…
                    </p>
                  ) : quickClientStatus === 'error' ? (
                    <p className="sidebar-label px-2 py-2 text-xs text-muted-foreground">
                      Liste alınamadı
                    </p>
                  ) : recentClients.length === 0 ? (
                    <p className="sidebar-label px-2 py-2 text-xs text-muted-foreground">
                      Henüz danışan yok
                    </p>
                  ) : (
                    <div className="sidebar-label flex flex-col gap-0.5">
                      {recentClients.map((client) => {
                        const name = `${client.firstName} ${client.lastName}`.trim()
                        const initials =
                          `${client.firstName[0] ?? ''}${client.lastName[0] ?? ''}`.toLocaleUpperCase(
                            'tr-TR',
                          )
                        return (
                          <LinkComponent
                            key={client.id}
                            href={`/danisanlar/${client.id}`}
                            onClick={
                              onNavigate ? () => onNavigate(`/danisanlar/${client.id}`) : undefined
                            }
                            className="sidebar-quick-client flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-foreground hover:bg-sidebar-accent"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-muted text-[0.62rem] text-muted-foreground">
                              {initials}
                            </span>
                            <span className="min-w-0 truncate">{name}</span>
                          </LinkComponent>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            renderItem(item)
          ),
        )}
      </div>
    </nav>
  )
}

export function DesktopTitlebarView({
  maximized,
  search,
  utilities,
  titlebarProps,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  maximized: boolean
  search?: ReactNode
  utilities?: ReactNode
  titlebarProps?: HTMLAttributes<HTMLElement>
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
}) {
  return (
    <header
      {...titlebarProps}
      className="clinic-desktop-titlebar desktop-titlebar relative z-50 flex h-12 shrink-0 select-none items-center border-b shadow-[0_1px_0_rgba(0,0,0,0.22)]"
      data-desktop-titlebar
    >
      <div className="flex shrink-0 items-center gap-2.5 px-4 md:w-60">
        {/* Plain img is intentional: this shared view is also bundled by Vite/Tauri without Next Image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/ogun-uygulama-ikonu.svg"
          alt=""
          width={28}
          height={28}
          className="size-7 shrink-0 rounded-lg shadow-sm"
        />
        <span className="text-sm font-semibold tracking-[-0.02em]">öğün</span>
        <span className="hidden rounded-full border border-current/15 bg-current/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] uppercase sm:inline">
          Desktop
        </span>
      </div>
      <div className="flex min-w-0 flex-1 justify-center px-4 max-sm:[&>*]:hidden">
        {search ? (
          <div className="w-full max-w-xl [&_button]:h-8 [&_button]:max-w-none [&_button]:border-current/15 [&_button]:bg-current/10 [&_button]:text-current [&_button:hover]:bg-current/15 [&_kbd]:border-current/15 [&_kbd]:bg-black/15 [&_kbd]:text-current">
            {search}
          </div>
        ) : null}
      </div>
      <div className="flex h-full shrink-0 items-center gap-0.5 pl-2">
        {utilities ? (
          <div className="flex items-center gap-0.5 pr-2 [&_button]:text-current [&_button:hover]:bg-current/10">
            {utilities}
          </div>
        ) : null}
        <div className="flex h-full border-l border-current/10">
          <WindowButton label="Küçült" onClick={onMinimize}>
            <Minus />
          </WindowButton>
          <WindowButton
            label={maximized ? 'Önceki boyuta dön' : 'Büyüt'}
            onClick={onToggleMaximize}
          >
            {maximized ? <Square /> : <Maximize2 />}
          </WindowButton>
          <WindowButton label="Kapat" destructive onClick={onClose}>
            <X />
          </WindowButton>
        </div>
      </div>
    </header>
  )
}

function WindowButton({
  label,
  destructive = false,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-full w-11 place-items-center transition-colors [&_svg]:size-3.5 ${
        destructive ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-current/10'
      }`}
    >
      {children}
    </button>
  )
}

export function TopBarView({
  pageContext,
  clinicSwitcher,
  search,
  utilities,
  userMenu,
}: {
  pageContext: ReactNode
  clinicSwitcher: ReactNode
  search: ReactNode
  utilities?: ReactNode
  userMenu: ReactNode
}) {
  return (
    <header className="app-topbar relative z-40 flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-3 backdrop-blur-xl sm:gap-4 sm:px-6">
      <div className="app-topbar-page-context">{pageContext}</div>
      <div className="app-topbar-divider hidden h-7 w-px bg-border md:block" />
      <div className="app-topbar-clinic-switcher min-w-0 flex-1 empty:hidden sm:flex-none">
        {clinicSwitcher}
      </div>
      <div className="app-topbar-search flex flex-none justify-end sm:flex-1 sm:justify-center sm:px-2 [&_button]:size-9 [&_button]:justify-center [&_button]:px-0 [&_button_span]:sr-only sm:[&_button]:h-9 sm:[&_button]:w-full sm:[&_button]:justify-start sm:[&_button]:px-3 sm:[&_button_span]:not-sr-only">
        {search}
      </div>
      <div className="app-topbar-utility flex items-center gap-0.5">
        {utilities ? <div className="hidden items-center gap-0.5 lg:flex">{utilities}</div> : null}
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        {userMenu}
      </div>
    </header>
  )
}

export function BottomNavView({
  role,
  currentPath,
  LinkComponent = AnchorLink,
  onNavigate,
}: {
  role: ClinicMemberRole
  currentPath: string
  LinkComponent?: ShellLinkComponent
  onNavigate?: (href: string) => void
}) {
  const items = visibleNavItems(role)
  const primaryItems = items.slice(0, 4)
  const moreItems = items.slice(4)
  const isActive = (href: string) => currentPath === href || currentPath.startsWith(`${href}/`)
  const moreActive = moreItems.some((item) => isActive(item.href))
  return (
    <nav
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 grid h-16 grid-cols-5 items-stretch rounded-2xl border border-border/80 bg-background/92 px-1 shadow-[0_12px_36px_-12px_rgba(16,38,32,0.35)] backdrop-blur-xl md:hidden"
      aria-label="Ana gezinme"
    >
      {primaryItems.map((item) => {
        const active = isActive(item.href)
        return (
          <LinkComponent
            key={item.href}
            href={item.href}
            onClick={onNavigate ? () => onNavigate(item.href) : undefined}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            className={cn(
              'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.62rem] font-medium text-muted-foreground transition-colors',
              active && 'bg-primary/8 text-primary',
            )}
          >
            <item.icon className="size-[1.15rem]" strokeWidth={active ? 2.3 : 1.8} />
            <span className="max-w-full truncate">{item.label}</span>
          </LinkComponent>
        )
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Diğer sayfalar"
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.62rem] font-medium text-muted-foreground transition-colors hover:bg-muted/70',
              moreActive && 'bg-primary/8 text-primary',
            )}
          >
            <MoreHorizontal className="size-[1.15rem]" strokeWidth={moreActive ? 2.3 : 1.8} />
            <span>Diğer</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-52 p-1.5">
          {moreItems.map((item) => {
            const active = isActive(item.href)
            return (
              <DropdownMenuItem key={item.href} asChild className="py-2">
                <LinkComponent
                  href={item.href}
                  onClick={onNavigate ? () => onNavigate(item.href) : undefined}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                >
                  <item.icon className={cn('size-4', active && 'text-primary')} />
                  <span className={cn(active && 'font-semibold text-primary')}>{item.label}</span>
                </LinkComponent>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
