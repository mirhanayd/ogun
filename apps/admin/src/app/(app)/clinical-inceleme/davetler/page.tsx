import Link from 'next/link'
import { db } from '@ogun/db'
import {
  listReviewerInvitationsForPlatform,
  type ClinicalInvitationDisplayStatus,
} from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const labels: Record<string, string> = {
  pending: 'Bekliyor',
  accepted: 'Kabul edildi',
  revoked: 'İptal edildi',
  expired: 'Süresi doldu',
  email_failed: 'E-posta hatası',
}
export default async function ReviewerInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('clinical.reviewers.read')
  const canManage = ctx.permissions.includes('clinical.reviewers.manage')
  const params = await searchParams
  const rawStatus = one(params.status)
  const pageSize = Number(one(params.pageSize) ?? 25)
  const status = ['pending', 'accepted', 'revoked', 'expired', 'email_failed'].includes(
    rawStatus ?? '',
  )
    ? (rawStatus as ClinicalInvitationDisplayStatus | 'email_failed')
    : undefined
  const data = await listReviewerInvitationsForPlatform(db, {
    search: one(params.q),
    status,
    page: Number(one(params.page) ?? 1),
    pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 25,
  })
  const href = (page: number) => {
    const q = new URLSearchParams()
    for (const [key, value] of Object.entries(params))
      if (typeof value === 'string' && key !== 'page' && value) q.set(key, value)
    q.set('page', String(page))
    return `/clinical-inceleme/davetler?${q}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hakem davetleri</h1>
          <p className="muted">{data.total} kayıt · tokenlar hiçbir admin sorgusunda gösterilmez</p>
        </div>
        {canManage ? (
          <Link className="button action-link" href="/clinical-inceleme/davetler/yeni">
            Yeni davet
          </Link>
        ) : null}
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/davetler" />
      <form className="filter-grid" method="get">
        <label>
          Arama
          <input
            className="input"
            name="q"
            defaultValue={one(params.q)}
            placeholder="Ad veya e-posta"
          />
        </label>
        <label>
          Durum
          <select className="input" name="status" defaultValue={status ?? ''}>
            <option value="">Tümü</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sayfa boyutu
          <select className="input" name="pageSize" defaultValue={data.pageSize}>
            {[25, 50, 100].map((v) => (
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
              <th>Davet</th>
              <th>Mesleki doğrulama</th>
              <th>Görev</th>
              <th>E-posta</th>
              <th>Sona erme</th>
              <th>Oluşturulma</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length ? (
              data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="table-link" href={`/clinical-inceleme/davetler/${row.id}`}>
                      {row.name}
                    </Link>
                    <br />
                    <small>{row.email}</small>
                  </td>
                  <td>{row.professionalRole}</td>
                  <td>{row.specialty ?? '—'}</td>
                  <td>
                    <span
                      className={`badge ${row.displayStatus === 'accepted' ? 'success' : row.displayStatus === 'revoked' || row.displayStatus === 'expired' ? 'failure' : ''}`}
                    >
                      {labels[row.displayStatus]}
                    </span>
                  </td>
                  <td>
                    {row.professionalVerificationConfirmed
                      ? 'Önceden doğrulandı'
                      : 'Kabul sonrası bekleyecek'}
                  </td>
                  <td>{row.stagedAssignmentCount}</td>
                  <td>
                    <span
                      className={`badge ${row.emailDeliveryStatus === 'sent' ? 'success' : row.emailDeliveryStatus === 'failed' ? 'failure' : ''}`}
                    >
                      {row.emailDeliveryStatus}
                    </span>
                  </td>
                  <td>{row.expiresAt.toLocaleString('tr-TR')}</td>
                  <td>{row.createdAt.toLocaleString('tr-TR')}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="muted">
                  Bu filtrelerle eşleşen davet yok.
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
