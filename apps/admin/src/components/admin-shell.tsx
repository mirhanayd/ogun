import Link from 'next/link'
import type { PlatformStaffContext } from '@/lib/platform-authz'
import type { PlatformPermission } from '@/lib/platform-permissions'
import { SignOutButton } from './sign-out-button'

const items: Array<{ label: string; href?: string; permission?: PlatformPermission }> = [
  { label: 'Genel Bakış', href: '/', permission: 'dashboard.read' },
  { label: 'Destek', href: '/destek', permission: 'tickets.read' },
  { label: 'Klinikler', href: '/klinikler', permission: 'clinics.read' },
  { label: 'Clinical Review', href: '/clinical-inceleme', permission: 'clinical.tasks.read' },
  { label: 'Besinler', permission: 'foods.read' },
  { label: 'Abonelikler', permission: 'subscriptions.read' },
  { label: 'Denetim', href: '/denetim', permission: 'audit.read' },
  { label: 'Platform Personeli', href: '/platform-personeli', permission: 'platform_staff.read' },
]

export function AdminShell({
  ctx,
  children,
}: {
  ctx: PlatformStaffContext
  children: React.ReactNode
}) {
  const visible = items.filter(
    (item) => !item.permission || ctx.permissions.includes(item.permission),
  )
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>Ogun Operasyon</strong>
        </div>
        <div className="user-box">
          <div>
            <strong>{ctx.user.name}</strong> · {ctx.staff.role}
          </div>
          <SignOutButton />
        </div>
      </header>
      <aside className="sidebar" aria-label="Ana navigasyon">
        <nav className="nav">
          {visible.map((item) =>
            item.href ? (
              <Link href={item.href} key={item.label}>
                {item.label}
              </Link>
            ) : (
              <span className="disabled" key={item.label}>
                {item.label} · Yakında
              </span>
            ),
          )}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
