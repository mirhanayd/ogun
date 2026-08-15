'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { cn } from '@/lib/utils'
import { visibleNavItems } from './nav-items'

export function SidebarNav({ role }: { role: ClinicMemberRole }) {
  const pathname = usePathname()
  const items = visibleNavItems(role)

  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Ana gezinme">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              active && 'bg-muted text-foreground',
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
