'use client'

import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
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
  onClick?: () => void
}

export type ShellLinkComponent = ComponentType<ShellLinkProps>

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
  connectivity,
  LinkComponent = AnchorLink,
  onNavigate,
}: {
  role: ClinicMemberRole
  currentPath: string
  connectivity: 'online' | 'offline' | 'checking'
  LinkComponent?: ShellLinkComponent
  onNavigate?: (href: string) => void
}) {
  const isOnline = connectivity === 'online'
  return (
    <nav
      className="flex min-h-0 flex-1 flex-col px-3 pb-4"
      aria-label="Ana gezinme"
      data-sidebar-navigation
    >
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
        Klinik yönetimi
      </p>
      <div className="flex flex-col gap-1" data-sidebar-navigation-items>
        {visibleNavItems(role).map((item) => {
          const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`)
          return (
            <LinkComponent
              key={item.href}
              href={item.href}
              onClick={onNavigate ? () => onNavigate(item.href) : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.82rem] font-medium text-sidebar-foreground/65 transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                active &&
                  'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-primary)_13%,transparent)]',
              )}
            >
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors group-hover:text-sidebar-foreground',
                  active && 'bg-sidebar-primary/10 text-sidebar-primary',
                )}
              >
                <item.icon className="size-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              {item.label}
              {active && (
                <span className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-sidebar-primary" />
              )}
            </LinkComponent>
          )
        })}
      </div>
      <div className="mt-auto rounded-xl border border-sidebar-border bg-background/45 p-3">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
          <span
            className={cn(
              'size-1.5 rounded-full',
              isOnline
                ? 'bg-emerald-500 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_12%,transparent)]'
                : connectivity === 'offline'
                  ? 'bg-destructive shadow-[0_0_0_3px_color-mix(in_oklch,var(--destructive)_12%,transparent)]'
                  : 'animate-pulse bg-amber-500',
            )}
          />
          {isOnline
            ? 'Sistem aktif'
            : connectivity === 'offline'
              ? 'Bağlantı yok'
              : 'Bağlantı kontrol ediliyor'}
        </div>
        <p className="text-[10px] leading-4 text-muted-foreground">
          {isOnline
            ? 'Verileriniz güvenli klinik alanına kaydediliyor.'
            : connectivity === 'offline'
              ? 'Desteklenen kayıtlar cihazda tutulur; çevrimiçi işlemler geçici olarak kapalıdır.'
              : 'Güvenli klinik alanına erişim doğrulanıyor.'}
        </p>
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
      <div className="flex w-60 shrink-0 items-center gap-2.5 px-4">
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
        <span className="rounded-full border border-current/15 bg-current/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] uppercase">
          Desktop
        </span>
      </div>
      <div className="flex min-w-0 flex-1 justify-center px-4">
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
    <header className="app-topbar flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-3 backdrop-blur-xl sm:gap-4 sm:px-6">
      {pageContext}
      <div className="hidden h-7 w-px bg-border md:block" />
      <div className="min-w-0 flex-1 sm:flex-none">{clinicSwitcher}</div>
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
