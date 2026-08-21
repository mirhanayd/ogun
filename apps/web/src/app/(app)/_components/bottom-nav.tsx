'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { cn } from '@/lib/utils'
import { visibleNavItems } from './nav-items'

// Mobilde sol kenar çubuğu yerine alt navigasyon (bkz. GitHub issue #11 /
// Prompt 3.2, GÖREV 2 — "Mobilde alt navigasyon"). 6 öğeye kadar sabit
// genişlikte sığdırıyoruz; ileride öğe sayısı artarsa yatay kaydırmaya
// (overflow-x-auto) düşer — ayrı bir "diğer" (more) menüsüne gerek kalmadan.
export function BottomNav({ role }: { role: ClinicMemberRole }) {
  const pathname = usePathname()
  const items = visibleNavItems(role)

  return (
    <nav
      className="fixed inset-x-2 bottom-2 z-40 flex h-16 items-stretch overflow-x-auto rounded-2xl border border-border/80 bg-background/92 px-1 shadow-[0_12px_36px_-12px_rgba(16,38,32,0.35)] backdrop-blur-xl md:hidden"
      aria-label="Ana gezinme"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.62rem] font-medium text-muted-foreground transition-colors',
              active && 'bg-primary/8 text-primary',
            )}
          >
            <item.icon className="size-[1.15rem]" strokeWidth={active ? 2.3 : 1.8} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
