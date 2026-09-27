'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type AdminNavItem = { label: string; href?: string; heading?: boolean; child?: boolean }

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="nav" aria-label="Platform bölümleri">
      {items.map((item) => {
        if (item.heading) return <span className="nav-heading" key={item.label}>{item.label}</span>
        if (!item.href) return null
        const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={['admin-nav-link', item.child ? 'nav-child' : '', active ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            <span className="admin-nav-indicator" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
