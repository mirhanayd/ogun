import Link from 'next/link'
import { db } from '@ogun/db'
import { getFoodOperationsSummary, getPlatformDashboardAnalytics, getPlatformDashboardSummary, getSubscriptionDashboardSummary } from '@ogun/db/queries'
import { AttentionList, Delta, Distribution, RecentActivity, TrendChart } from '@/components/admin-analytics'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  const ctx = await requirePlatformPermission('dashboard.read')
  const [summary, analytics, foodSummary, subscriptionSummary] = await Promise.all([
    getPlatformDashboardSummary(db),
    getPlatformDashboardAnalytics(db),
    ctx.permissions.includes('foods.read') ? getFoodOperationsSummary(db) : null,
    ctx.permissions.includes('subscriptions.read') ? getSubscriptionDashboardSummary(db) : null,
  ])

  const attention = [
    ctx.permissions.includes('tickets.read') && { label: 'Triyaj bekleyen destek talebi', detail: 'Öncelik atanmamış açık kayıtlar', value: analytics.totals.untriagedTickets, href: '/destek?status=submitted', tone: 'amber' as const },
    ctx.permissions.includes('tickets.read') && { label: 'Yüksek öncelikli açık talep', detail: 'P1 veya P2 olarak sınıflanan kayıtlar', value: analytics.totals.urgentTickets, href: '/destek?priority=P1', tone: 'red' as const },
    ctx.permissions.includes('clinics.read') && { label: 'Onboarding tamamlanmamış klinik', detail: 'Kurulum akışı henüz tamamlanmadı', value: analytics.totals.incompleteOnboarding, href: '/klinikler', tone: 'amber' as const },
    subscriptionSummary && { label: 'Abonelik kaydı tutarsızlığı', detail: 'Klinik ve abonelik kaydı eşleşmesi bekliyor', value: subscriptionSummary.drift, href: '/abonelikler?health=drift', tone: 'red' as const },
    subscriptionSummary && { label: 'Yakında bitecek deneme', detail: 'Takip gerektiren deneme abonelikleri', value: subscriptionSummary.trialsEndingSoon, href: '/abonelikler?status=trialing', tone: 'amber' as const },
    foodSummary && { label: 'İnceleme bekleyen içerik', detail: 'Besin ve tarif yayın sırası', value: foodSummary.reviewFoods + foodSummary.reviewRecipes, href: '/besinler?status=review', tone: 'green' as const },
  ].filter(Boolean) as Array<{ label: string; detail: string; value: number; href: string; tone: 'green' | 'amber' | 'red' }>

  return <>
    <div className="page-head dashboard-head"><div><span className="brand">Platform görünümü</span><h1>Operasyonun nabzı</h1><p className="muted">Son 30 gün, önceki 30 günlük dönemle karşılaştırılır.</p></div><div className="dashboard-meta"><span className="badge success">MFA korumalı</span><span className="muted">{ctx.staff.role.replace('_', ' ')}</span></div></div>

    <section className="metric-grid" aria-label="Platformun temel göstergeleri">
      <article className="metric-card"><span>Klinikler</span><strong>{summary.clinics}</strong><Delta {...analytics.growth.clinics} /><Link href="/klinikler">Klinikleri incele <b>→</b></Link></article>
      <article className="metric-card"><span>Kullanıcılar</span><strong>{summary.users}</strong><Delta {...analytics.growth.users} /><Link href="/klinikler">Kullanıcı kayıtları <b>→</b></Link></article>
      <article className="metric-card"><span>Aktif danışanlar</span><strong>{analytics.totals.activeClients}</strong><Delta {...analytics.growth.clients} /><span className="metric-footnote">{analytics.totals.archivedClients} arşivlenmiş kayıt</span></article>
      <article className="metric-card metric-card-emphasis"><span>Açık destek talepleri</span><strong>{analytics.totals.openTickets}</strong><Delta {...analytics.growth.tickets} /><Link href="/destek">Destek kuyruğuna git <b>→</b></Link></article>
    </section>

    <div className="analytics-grid analytics-grid-wide section">
      <TrendChart title="Platforma katılım" description="Klinik ve kullanıcı kayıtları; oluşturulma tarihine göre aylık akış." data={analytics.monthly} series={[{ key: 'clinics', label: 'Klinikler', color: '#287955' }, { key: 'users', label: 'Kullanıcılar', color: '#286d8c' }]} />
      <TrendChart title="Klinik çalışma hacmi" description="Silinmemiş danışan kayıtları ve açılan destek talepleri." data={analytics.monthly} series={[{ key: 'clients', label: 'Danışanlar', color: '#123c2c' }, { key: 'tickets', label: 'Talepler', color: '#b87818' }]} />
    </div>

    <div className="analytics-grid section">
      {subscriptionSummary ? <Distribution title="Klinik abonelik durumu" description="Klinik kaydındaki güncel abonelik durumu." items={[{ label: 'Aktif', value: analytics.subscriptionStatuses.active ?? 0, href: '/abonelikler?status=active', tone: 'green' }, { label: 'Deneme', value: analytics.subscriptionStatuses.trialing ?? 0, href: '/abonelikler?status=trialing', tone: 'blue' }, { label: 'Ödeme bekliyor', value: analytics.subscriptionStatuses.past_due ?? 0, href: '/abonelikler?status=past_due', tone: 'amber' }, { label: 'İptal / sona ermiş', value: (analytics.subscriptionStatuses.canceled ?? 0) + (analytics.subscriptionStatuses.expired ?? 0), href: '/abonelikler?status=canceled', tone: 'red' }]} /> : null}
      {subscriptionSummary ? <Distribution title="Abonelik plan dağılımı" description="Mevcut abonelik kayıtlarının plan kodlarına göre dağılımı." items={Object.entries(analytics.planDistribution).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value, href: '/abonelikler', tone: 'green' }))} /> : null}
      <AttentionList items={attention} />
    </div>
    <RecentActivity rows={analytics.recentActivity} />
  </>
}
