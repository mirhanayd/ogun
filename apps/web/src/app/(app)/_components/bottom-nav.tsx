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
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch overflow-x-auto border-t border-border bg-background md:hidden"
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
              'flex min-w-16 flex-1 flex-col items-center justify-center gap-0.5 text-[0.65rem] font-medium text-muted-foreground',
              active && 'text-primary',
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
