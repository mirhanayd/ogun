import Link from 'next/link'
import { db } from '@ogun/db'
import { listSubscriptionsForPlatform, type PlatformSubscriptionFilters } from '@ogun/db/queries'
import {
  PAYMENT_PROVIDERS,
  PLAN_DEFINITIONS,
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
} from '@ogun/subscription-core'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const yesNo = (value: string | undefined) =>
  value === 'true' ? true : value === 'false' ? false : undefined

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePlatformPermission('subscriptions.read')
  const params = await searchParams
  const rawSize = Number(one(params.pageSize) ?? 25)
  const filters: PlatformSubscriptionFilters = {
    search: one(params.q),
    plan: SUBSCRIPTION_PLANS.find((value) => value === one(params.plan)),
    status: SUBSCRIPTION_STATUSES.find((value) => value === one(params.status)),
    billingCycle: SUBSCRIPTION_BILLING_CYCLES.find((value) => value === one(params.billing)),
    provider: PAYMENT_PROVIDERS.find((value) => value === one(params.provider)),
    cancelAtPeriodEnd: yesNo(one(params.cancel)),
    trialEndingSoon: one(params.trialSoon) === 'true',
    driftOnly: one(params.drift) === 'true',
    page: Number(one(params.page) ?? 1),
    pageSize: rawSize === 50 || rawSize === 100 ? rawSize : 25,
  }
  const data = await listSubscriptionsForPlatform(db, filters)
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize))
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params))
      if (typeof value === 'string' && value) next.set(key, value)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return `/abonelikler?${next}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Abonelikler</h1>
          <p className="muted">
            {data.total} Ogun SaaS abonelik kaydı · MRR/tahsilat metriği değildir
          </p>
        </div>
      </div>
      <nav className="quick-filters" aria-label="Hızlı abonelik filtreleri">
        <Link href="/abonelikler">Tümü</Link>
        <Link href={href({ status: 'active', page: undefined })}>Aktif</Link>
        <Link href={href({ status: 'trialing', page: undefined })}>Denemedekiler</Link>
        <Link href={href({ trialSoon: 'true', status: undefined, page: undefined })}>
          Denemesi yakında bitecek
        </Link>
        <Link href={href({ status: 'past_due', page: undefined })}>Past due</Link>
        <Link href={href({ cancel: 'true', page: undefined })}>İptal bekleyen</Link>
        <Link href={href({ status: 'canceled', page: undefined })}>İptal edilen</Link>
        <Link href={href({ drift: 'true', page: undefined })}>Tutarsız kayıtlar</Link>
      </nav>
      <form className="filter-grid subscription-filter" method="get">
        <label>
          Arama
          <input
            className="input"
            name="q"
            defaultValue={filters.search}
            placeholder="Klinik adı veya slug"
          />
        </label>
        <label>
          Plan
          <select className="input" name="plan" defaultValue={filters.plan ?? ''}>
            <option value="">Tümü</option>
            {SUBSCRIPTION_PLANS.map((value) => (
              <option key={value} value={value}>
                {PLAN_DEFINITIONS[value].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Durum
          <select className="input" name="status" defaultValue={filters.status ?? ''}>
            <option value="">Tümü</option>
            {SUBSCRIPTION_STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Faturalama
          <select className="input" name="billing" defaultValue={filters.billingCycle ?? ''}>
            <option value="">Tümü</option>
            {SUBSCRIPTION_BILLING_CYCLES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Sağlayıcı
          <select className="input" name="provider" defaultValue={filters.provider ?? ''}>
            <option value="">Tümü</option>
            {PAYMENT_PROVIDERS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          İptal bekliyor
          <select className="input" name="cancel" defaultValue={one(params.cancel) ?? ''}>
            <option value="">Tümü</option>
            <option value="true">Evet</option>
            <option value="false">Hayır</option>
          </select>
        </label>
        <label>
          Sayfa boyutu
          <select className="input" name="pageSize" defaultValue={data.pageSize}>
            {[25, 50, 100].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Filtrele
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Klinik</th>
              <th>Plan</th>
              <th>Durum</th>
              <th>Faturalama</th>
              <th>Sağlayıcı</th>
              <th>Deneme bitişi</th>
              <th>Dönem bitişi</th>
              <th>İptal?</th>
              <th>Kullanıcı</th>
              <th>Danışan</th>
              <th>Son olay</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="muted">
                  Filtrelerle eşleşen kayıt yok.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.clinicId}>
                  <td>
                    <Link className="table-link" href={`/abonelikler/${row.clinicId}`}>
                      {row.clinicName}
                    </Link>
                    <br />
                    <small className="muted">{row.clinicSlug}</small>
                  </td>
                  <td>{row.planCode ? PLAN_DEFINITIONS[row.planCode].label : '—'}</td>
                  <td>
                    <span className="badge">{row.status}</span>
                  </td>
                  <td>{row.billingCycle ?? '—'}</td>
                  <td>{row.provider ?? '—'}</td>
                  <td>{row.trialEndsAt?.toLocaleDateString('tr-TR') ?? '—'}</td>
                  <td>{row.currentPeriodEnd?.toLocaleDateString('tr-TR') ?? '—'}</td>
                  <td>{row.cancelAtPeriodEnd ? 'Evet' : 'Hayır'}</td>
                  <td>{row.activeUsers}</td>
                  <td>{row.activeClients}</td>
                  <td>{row.lastEventAt?.toLocaleString('tr-TR') ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination">
        {data.page > 1 ? <Link href={href({ page: String(data.page - 1) })}>Önceki</Link> : null}
        <span>
          {data.page} / {pageCount}
        </span>
        {data.page < pageCount ? (
          <Link href={href({ page: String(data.page + 1) })}>Sonraki</Link>
        ) : null}
      </nav>
    </>
  )
}
