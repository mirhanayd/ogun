import Link from 'next/link'
import Image from 'next/image'
import type { PlatformStaffContext } from '@/lib/platform-authz'
import type { PlatformPermission } from '@/lib/platform-permissions'
import { AdminNav } from './admin-nav'
import { SignOutButton } from './sign-out-button'

const items: Array<{
  label: string
  href?: string
  permission?: PlatformPermission
  heading?: boolean
  child?: boolean
}> = [
  { label: 'Genel Bakış', href: '/', permission: 'dashboard.read' },
  { label: 'Destek', href: '/destek', permission: 'tickets.read' },
  { label: 'Klinikler', href: '/klinikler', permission: 'clinics.read' },
  { label: 'Klinik İnceleme', href: '/clinical-inceleme', permission: 'clinical.tasks.read' },
  { label: 'Besin Veritabanı', permission: 'foods.read', heading: true },
  { label: 'Besinler', href: '/besinler', permission: 'foods.read', child: true },
  { label: 'Tarifler', href: '/tarifler', permission: 'foods.read', child: true },
  { label: 'Platform Yönetimi', heading: true },
  { label: 'Abonelikler', href: '/abonelikler', permission: 'subscriptions.read' },
  { label: 'Sistem Durumu', href: '/sistem', permission: 'system.read' },
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
  const userInitial = ctx.user.name?.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'O'
  return (
    <div className="app-shell">
      <a className="admin-skip" href="#admin-main">Ana içeriğe geç</a>
      <aside className="sidebar" aria-label="Ana navigasyon">
        <Link className="admin-brand" href="/" aria-label="Ogun Operasyon ana sayfa">
          {/* Existing Ogun brand artwork, copied unchanged from the web app. */}
          <Image src="/brand/ogun-logo-yatay.svg" alt="Ogun" width={112} height={55} />
          <span className="admin-brand-caption">OPERASYON</span>
        </Link>
        <div className="admin-nav-scroll">
          <div className="admin-nav-eyebrow">ÇALIŞMA ALANI</div>
          <AdminNav items={visible} />
        </div>
        <div className="admin-sidebar-bottom">
          <span className="admin-live-dot" aria-hidden="true" />
          <span>Güvenli platform yönetimi</span>
        </div>
      </aside>
      <header className="topbar">
        <div className="admin-topbar-heading">
          <span className="admin-topbar-eyebrow">OGUN / PLATFORM</span>
          <strong>Operasyon Merkezi</strong>
        </div>
        <div className="user-box">
          <span className="admin-user-avatar" aria-hidden="true">{userInitial}</span>
          <div className="admin-user-info">
            <strong>{ctx.user.name}</strong>
            <span>{ctx.staff.role === 'super_admin' ? 'Süper yönetici' : ctx.staff.role}</span>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="main" id="admin-main">{children}</main>
    </div>
  )
}
