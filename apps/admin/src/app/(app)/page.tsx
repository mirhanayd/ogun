import { db } from '@ogun/db'
import { getPlatformDashboardSummary } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const ctx = await requirePlatformPermission('dashboard.read')
  const summary = await getPlatformDashboardSummary(db)
  const metrics = [
    ['Toplam klinik', summary.clinics],
    ['Toplam kullanıcı', summary.users],
    ['Aktif platform personeli', summary.activeStaff],
    ['Aktif admin session', summary.activeAdminSessions],
  ] as const
  return (
    <>
      <div className="page-head">
        <div><h1>Genel Bakış</h1><p className="muted">Platform erişim ve operasyon özeti</p></div>
        <span className="badge">MFA etkin · {ctx.staff.role}</span>
      </div>
      <section className="cards" aria-label="Platform özeti">
        {metrics.map(([label, value]) => <article className="card" key={label}><div className="muted">{label}</div><div className="metric">{value}</div></article>)}
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Oturum güvenliği</h2>
        <p className="muted">Admin oturumları ayrı tabloda tutulur, en fazla 8 saat sürer ve platform yetkisi her istekte yeniden doğrulanır.</p>
        <div>Session ID: <code>{ctx.sessionId}</code></div>
      </section>
    </>
  )
}
