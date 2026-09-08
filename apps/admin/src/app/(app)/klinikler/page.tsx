import Link from 'next/link'
import { db } from '@ogun/db'
import { listClinicsForPlatform, type PlatformClinicFilters } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const plans = ['başlangıç', 'klinik', 'kurumsal'] as const
const statuses = ['trialing', 'active', 'past_due', 'canceled'] as const
const cycles = ['monthly', 'yearly'] as const
const asOne = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function ClinicsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformPermission('clinics.read')
  const params = await searchParams
  const rawPlan = asOne(params.plan)
  const rawStatus = asOne(params.status)
  const rawCycle = asOne(params.billing)
  const rawOnboarding = asOne(params.onboarding)
  const rawSize = Number(asOne(params.pageSize) ?? 25)
  const filters: PlatformClinicFilters = {
    search: asOne(params.q),
    plan: plans.find((value) => value === rawPlan),
    status: statuses.find((value) => value === rawStatus),
    billingCycle: cycles.find((value) => value === rawCycle),
    onboarding: rawOnboarding === 'complete' || rawOnboarding === 'incomplete' ? rawOnboarding : undefined,
    page: Number(asOne(params.page) ?? 1),
    pageSize: rawSize === 50 || rawSize === 100 ? rawSize : 25,
  }
  const data = await listClinicsForPlatform(db, filters)
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize))
  const pageHref = (page: number) => { const next = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (typeof value === 'string' && key !== 'page' && value) next.set(key, value); next.set('page', String(page)); return `/klinikler?${next}` }
  return <><div className="page-head"><div><h1>Klinikler</h1><p className="muted">{data.total} canonical klinik kaydı</p></div></div>
    <form className="filter-grid" method="get"><label>Arama<input className="input" name="q" defaultValue={filters.search} placeholder="Klinik adı veya slug" /></label><label>Plan<select className="input" name="plan" defaultValue={filters.plan ?? ''}><option value="">Tümü</option>{plans.map((v) => <option key={v}>{v}</option>)}</select></label><label>Durum<select className="input" name="status" defaultValue={filters.status ?? ''}><option value="">Tümü</option>{statuses.map((v) => <option key={v}>{v}</option>)}</select></label><label>Faturalama<select className="input" name="billing" defaultValue={filters.billingCycle ?? ''}><option value="">Tümü</option>{cycles.map((v) => <option key={v}>{v}</option>)}</select></label><label>Onboarding<select className="input" name="onboarding" defaultValue={filters.onboarding ?? ''}><option value="">Tümü</option><option value="complete">Tamamlandı</option><option value="incomplete">Eksik</option></select></label><label>Sayfa boyutu<select className="input" name="pageSize" defaultValue={data.pageSize}>{[25,50,100].map((v) => <option key={v}>{v}</option>)}</select></label><button className="button" type="submit">Filtrele</button></form>
    <div className="table-wrap"><table><thead><tr><th>Klinik</th><th>Plan</th><th>Abonelik durumu</th><th>Faturalama</th><th>Kullanıcı</th><th>Onboarding</th><th>Son oturum aktivitesi</th><th>Oluşturulma</th></tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={8} className="muted">Filtrelerle eşleşen klinik yok.</td></tr> : data.rows.map((row) => <tr key={row.id}><td><Link className="table-link" href={`/klinikler/${row.id}`}>{row.name}</Link><br /><small className="muted">{row.slug}</small></td><td>{row.planCode ?? '—'}</td><td><span className="badge">{row.subscriptionStatus}</span></td><td>{row.billingCycle ?? '—'}</td><td>{row.memberCount}</td><td>{row.onboardingCompletedAt ? 'Tamamlandı' : 'Eksik'}</td><td>{row.lastSessionActivity?.toLocaleString('tr-TR') ?? '—'}</td><td>{row.createdAt.toLocaleDateString('tr-TR')}</td></tr>)}</tbody></table></div>
    <nav className="pagination">{data.page > 1 ? <Link href={pageHref(data.page - 1)}>Önceki</Link> : null}<span>{data.page} / {pageCount}</span>{data.page < pageCount ? <Link href={pageHref(data.page + 1)}>Sonraki</Link> : null}</nav>
  </>
}
