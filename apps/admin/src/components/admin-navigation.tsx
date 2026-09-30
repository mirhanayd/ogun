'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminIcon, type AdminIconName } from './admin-icons'

export type AdminNavItem = {
  label: string
  href?: string
  icon?: AdminIconName
  heading?: boolean
}

function isCurrent(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNavigation({ items, mobile = false }: { items: AdminNavItem[]; mobile?: boolean }) {
  const pathname = usePathname()
  return (
    <nav className={mobile ? 'admin-mobile-nav' : 'admin-nav'} aria-label="Platform navigasyonu">
      {items.map((item) => {
        if (item.heading) return <p className="admin-nav-group" key={item.label}>{item.label}</p>
        if (!item.href || !item.icon) return null
        const current = isCurrent(pathname, item.href)
        return (
          <Link
            className={`admin-nav-link${current ? ' is-current' : ''}`}
            aria-current={current ? 'page' : undefined}
            href={item.href}
            key={item.href}
          >
            <AdminIcon name={item.icon} className="admin-nav-icon" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
