import Link from 'next/link'
import { db } from '@ogun/db'
import { listReviewersForPlatform } from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'
import {
  CLINICAL_PROFESSIONAL_ROLES,
  CLINICAL_REVIEWER_CAPABILITIES,
  PROFESSIONAL_ROLE_LABELS,
} from '@/lib/clinical-review-model'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function ReviewersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('clinical.reviewers.read')
  const canManage = ctx.permissions.includes('clinical.reviewers.manage')
  const p = await searchParams
  const size = Number(one(p.pageSize) ?? 25)
  const data = await listReviewersForPlatform(db, {
    search: one(p.q),
    professionalRole: one(p.role),
    verificationStatus: one(p.verification),
    active:
      one(p.active) === 'active' || one(p.active) === 'inactive'
        ? (one(p.active) as 'active' | 'inactive')
        : undefined,
    capability: one(p.capability),
    page: Number(one(p.page) ?? 1),
    pageSize: size === 50 || size === 100 ? size : 25,
  })
  const href = (page: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(p))
      if (typeof v === 'string' && k !== 'page' && v) q.set(k, v)
    q.set('page', String(page))
    return `/clinical-inceleme/hakemler?${q}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clinical reviewerlar</h1>
          <p className="muted">
            {data.total} hakem · platform rolünden bağımsız klinik yetkilendirme
          </p>
        </div>
        {canManage ? (
          <Link className="button action-link" href="/clinical-inceleme/davetler/yeni">
            Yeni davet
          </Link>
        ) : null}
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/hakemler" />
      <form className="filter-grid" method="get">
        <label>
          Arama
          <input
            className="input"
            name="q"
            defaultValue={one(p.q)}
            placeholder="Ad, e-posta, uzmanlık"
          />
        </label>
        <label>
          Meslek
          <select className="input" name="role" defaultValue={one(p.role) ?? ''}>
            <option value="">Tümü</option>
            {CLINICAL_PROFESSIONAL_ROLES.map((v) => (
              <option key={v} value={v}>
                {PROFESSIONAL_ROLE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Doğrulama
          <select className="input" name="verification" defaultValue={one(p.verification) ?? ''}>
            <option value="">Tümü</option>
            {['pending', 'verified', 'suspended', 'rejected'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Aktiflik
          <select className="input" name="active" defaultValue={one(p.active) ?? ''}>
            <option value="">Tümü</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </label>
        <label>
          Yetkinlik
          <select className="input" name="capability" defaultValue={one(p.capability) ?? ''}>
            <option value="">Tümü</option>
            {CLINICAL_REVIEWER_CAPABILITIES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <button className="button">Filtrele</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ad / E-posta</th>
              <th>Meslek</th>
              <th>Uzmanlık</th>
              <th>Clinical durum</th>
              <th>Aktif</th>
              <th>Yetkinlikler</th>
              <th>Aktif atama</th>
              <th>Tamamlanan</th>
              <th>Son aktivite</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length ? (
              data.rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <Link className="table-link" href={`/clinical-inceleme/hakemler/${row.userId}`}>
                      {row.userName}
                    </Link>
                    <br />
                    <small>{row.userEmail}</small>
                  </td>
                  <td>{row.professionalRole}</td>
                  <td>{row.specialty ?? '—'}</td>
                  <td>
                    <span className="badge">{row.verificationStatus}</span>
                  </td>
                  <td>{row.isActive ? 'Evet' : 'Hayır'}</td>
                  <td className="wrap-cell">{row.capabilities.join(', ') || '—'}</td>
                  <td>{row.activeAssignments}</td>
                  <td>{row.completedReviews}</td>
                  <td>{row.lastActivity.toLocaleString('tr-TR')}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="muted">
                  Hakem bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination">
        {data.page > 1 ? <Link href={href(data.page - 1)}>Önceki</Link> : null}
        <span>
          {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        {data.page * data.pageSize < data.total ? (
          <Link href={href(data.page + 1)}>Sonraki</Link>
        ) : null}
      </nav>
    </>
  )
}
