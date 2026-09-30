import Link from 'next/link'
import type { PlatformStaffContext } from '@/lib/platform-authz'
import type { PlatformPermission } from '@/lib/platform-permissions'
import { AdminNavigation, type AdminNavItem } from './admin-navigation'
import { SignOutButton } from './sign-out-button'

const items: Array<AdminNavItem & { permission?: PlatformPermission }> = [
  { label: 'Genel bakış', href: '/', icon: 'overview', permission: 'dashboard.read' },
  { label: 'Destek', href: '/destek', icon: 'support', permission: 'tickets.read' },
  { label: 'Klinikler', href: '/klinikler', icon: 'clinics', permission: 'clinics.read' },
  { label: 'Clinical review', href: '/clinical-inceleme', icon: 'review', permission: 'clinical.tasks.read' },
  { label: 'Besin veritabanı', permission: 'foods.read', heading: true },
  { label: 'Besinler', href: '/besinler', icon: 'food', permission: 'foods.read' },
  { label: 'Tarifler', href: '/tarifler', icon: 'recipe', permission: 'foods.read' },
  { label: 'Abonelikler', href: '/abonelikler', icon: 'billing', permission: 'subscriptions.read' },
  { label: 'Sistem durumu', href: '/sistem', icon: 'system', permission: 'system.read' },
  { label: 'Denetim', href: '/denetim', icon: 'audit', permission: 'audit.read' },
  { label: 'Platform personeli', href: '/platform-personeli', icon: 'team', permission: 'platform_staff.read' },
]

const ROLE_LABELS: Record<PlatformStaffContext['staff']['role'], string> = {
  super_admin: 'Süper yönetici',
  support: 'Destek operasyonu',
  clinical_ops: 'Klinik operasyon',
  food_editor: 'Besin editörü',
  billing_ops: 'Abonelik operasyonu',
  read_only: 'Salt okunur',
}

export function AdminShell({ ctx, children }: { ctx: PlatformStaffContext; children: React.ReactNode }) {
  const visible = items.filter((item) => !item.permission || ctx.permissions.includes(item.permission))
  return <div className="admin-app-shell">
    <a className="skip-link" href="#ana-icerik">İçeriğe geç</a>
    <aside className="admin-rail">
      <Link className="admin-brand" href="/" aria-label="Ogun Operasyon ana sayfa">
        <span className="admin-brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>öğün</strong><small>operasyon</small></span>
      </Link>
      <div className="admin-rail-context"><span>Platform yönetimi</span><b>Canlı çalışma alanı</b></div>
      <AdminNavigation items={visible} />
      <footer className="admin-rail-footer">
        <div className="admin-user-avatar" aria-hidden="true">{ctx.user.name.slice(0, 2).toLocaleUpperCase('tr-TR')}</div>
        <div className="admin-user-copy"><strong>{ctx.user.name}</strong><span>{ROLE_LABELS[ctx.staff.role]}</span></div>
        <SignOutButton />
      </footer>
    </aside>
    <div className="admin-content-shell">
      <header className="admin-topbar">
        <div className="admin-mobile-menu"><details><summary>Menü</summary><AdminNavigation items={visible} mobile /></details></div>
        <p>Ogun platform operasyon merkezi</p>
        <div className="admin-topbar-status"><span className="status-dot" aria-hidden="true" /> MFA korumalı oturum</div>
      </header>
      <main className="main" id="ana-icerik">{children}</main>
    </div>
  </div>
}
