'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { useConnectivityStatus } from '@/components/connectivity-status-provider'
import { cn } from '@/lib/utils'
import { visibleNavItems } from './nav-items'

export function SidebarNav({ role }: { role: ClinicMemberRole }) {
  const pathname = usePathname()
  const items = visibleNavItems(role)
  const connectivity = useConnectivityStatus()
  const isOnline = connectivity === 'online'

  return (
    <nav className="flex min-h-0 flex-1 flex-col px-3 pb-4" aria-label="Ana gezinme">
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
        Klinik yönetimi
      </p>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
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
            </Link>
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
