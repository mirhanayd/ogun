'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import type { ClinicMemberRole } from '@ogun/db/schema'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { visibleNavItems } from './nav-items'

// Mobilde sol kenar çubuğu yerine alt navigasyon (bkz. GitHub issue #11 /
// Prompt 3.2, GÖREV 2 — "Mobilde alt navigasyon"). 6 öğeye kadar sabit
// genişlikte sığdırıyoruz; ileride öğe sayısı artarsa yatay kaydırmaya
// (overflow-x-auto) düşer — ayrı bir "diğer" (more) menüsüne gerek kalmadan.
export function BottomNav({ role }: { role: ClinicMemberRole }) {
  const pathname = usePathname()
  const items = visibleNavItems(role)
  const primaryItems = items.slice(0, 4)
  const moreItems = items.slice(4)
  const moreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )

  return (
    <nav
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 grid h-16 grid-cols-5 items-stretch rounded-2xl border border-border/80 bg-background/92 px-1 shadow-[0_12px_36px_-12px_rgba(16,38,32,0.35)] backdrop-blur-xl md:hidden"
      aria-label="Ana gezinme"
    >
      {primaryItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.62rem] font-medium text-muted-foreground transition-colors',
              active && 'bg-primary/8 text-primary',
            )}
          >
            <item.icon className="size-[1.15rem]" strokeWidth={active ? 2.3 : 1.8} />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
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
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <DropdownMenuItem key={item.href} asChild className="py-2">
                <Link href={item.href} aria-current={active ? 'page' : undefined}>
                  <item.icon className={cn('size-4', active && 'text-primary')} />
                  <span className={cn(active && 'font-semibold text-primary')}>{item.label}</span>
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
