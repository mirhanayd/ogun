import { db } from '@ogun/db'
import { getFoodOperationsSummary, getPlatformDashboardSummary, getSubscriptionDashboardSummary } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const ctx = await requirePlatformPermission('dashboard.read')
  const summary = await getPlatformDashboardSummary(db)
  const foodSummary = ctx.permissions.includes('foods.read')
    ? await getFoodOperationsSummary(db)
    : null
  const subscriptionSummary = ctx.permissions.includes('subscriptions.read')
    ? await getSubscriptionDashboardSummary(db)
    : null
  const metrics = [
    ['Toplam klinik', summary.clinics],
    ['Toplam kullanıcı', summary.users],
    ['Aktif platform personeli', summary.activeStaff],
    ['Aktif admin session', summary.activeAdminSessions],
  ] as const
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Genel Bakış</h1>
          <p className="muted">Platform erişim ve operasyon özeti</p>
        </div>
        <span className="badge">MFA etkin · {ctx.staff.role}</span>
      </div>
      <section className="cards" aria-label="Platform özeti">
        {metrics.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="muted">{label}</div>
            <div className="metric">{value}</div>
          </article>
        ))}
      </section>
      {subscriptionSummary ? (
        <section className="section">
          <h2>Ogun SaaS abonelikleri</h2>
          <div className="cards section">
            {[
              ['Aktif', subscriptionSummary.active],
              ['Deneme', subscriptionSummary.trialing],
              ['Past due', subscriptionSummary.pastDue],
              ['İptal bekleyen', subscriptionSummary.cancelPending],
              ['Yakında bitecek denemeler', subscriptionSummary.trialsEndingSoon],
              ['Tutarsız kayıtlar', subscriptionSummary.drift],
            ].map(([label, value]) => <article className="card" key={label}><div className="muted">{label}</div><div className="metric">{value}</div></article>)}
          </div>
        </section>
      ) : null}
      {foodSummary ? (
        <section className="section">
          <h2>Besin operasyonları</h2>
          <div className="cards section">
            <article className="card">
              <div className="muted">Taslak besinler</div>
              <div className="metric">{foodSummary.draftFoods}</div>
            </article>
            <article className="card">
              <div className="muted">Kontrol bekleyen besinler</div>
              <div className="metric">{foodSummary.reviewFoods}</div>
            </article>
            <article className="card">
              <div className="muted">Yayındaki OGUN besinleri</div>
              <div className="metric">{foodSummary.publishedFoods}</div>
            </article>
            <article className="card">
              <div className="muted">Taslak tarifler</div>
              <div className="metric">{foodSummary.draftRecipes}</div>
            </article>
            <article className="card">
              <div className="muted">Kontrol bekleyen tarifler</div>
              <div className="metric">{foodSummary.reviewRecipes}</div>
            </article>
          </div>
        </section>
      ) : null}
      <section className="card" style={{ marginTop: 18 }}>
        <h2>Oturum güvenliği</h2>
        <p className="muted">
          Admin oturumları ayrı tabloda tutulur, en fazla 8 saat sürer ve platform yetkisi her
          istekte yeniden doğrulanır.
        </p>
        <div>
          Session ID: <code>{ctx.sessionId}</code>
        </div>
      </section>
    </>
  )
}
