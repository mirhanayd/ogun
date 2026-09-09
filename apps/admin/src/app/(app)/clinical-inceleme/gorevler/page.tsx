import Link from 'next/link'
import { db } from '@ogun/db'
import { listClinicalTasksForPlatform } from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { CLINICAL_REVIEWER_CAPABILITIES } from '@/lib/clinical-review-model'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function ClinicalTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePlatformPermission('clinical.tasks.read')
  const p = await searchParams
  const size = Number(one(p.pageSize) ?? 25)
  const data = await listClinicalTasksForPlatform(db, {
    search: one(p.q),
    priority: one(p.priority),
    status: one(p.status),
    requiredCapability: one(p.capability),
    subjectType: one(p.subjectType),
    confidence: one(p.confidence),
    assignmentState:
      one(p.assignment) === 'assigned' || one(p.assignment) === 'unassigned'
        ? (one(p.assignment) as 'assigned' | 'unassigned')
        : undefined,
    reviewerUserId: one(p.reviewer),
    page: Number(one(p.page) ?? 1),
    pageSize: size === 50 || size === 100 ? size : 25,
  })
  const href = (page: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(p))
      if (typeof v === 'string' && k !== 'page' && v) q.set(k, v)
    q.set('page', String(page))
    return `/clinical-inceleme/gorevler?${q}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clinical review görevleri</h1>
          <p className="muted">{data.total} görev · atama operasyonları hakem detayından yapılır</p>
        </div>
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/gorevler" />
      <form className="filter-grid">
        <label>
          Arama
          <input className="input" name="q" defaultValue={one(p.q)} />
        </label>
        <label>
          Öncelik
          <select className="input" name="priority" defaultValue={one(p.priority) ?? ''}>
            <option value="">Tümü</option>
            {['P1', 'P2', 'P3', 'P4', 'P5'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Durum
          <input className="input" name="status" defaultValue={one(p.status)} />
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
        <label>
          Konu
          <select className="input" name="subjectType" defaultValue={one(p.subjectType) ?? ''}>
            <option value="">Tümü</option>
            <option value="medication">İlaç</option>
            <option value="condition">Durum</option>
          </select>
        </label>
        <label>
          Güven
          <select className="input" name="confidence" defaultValue={one(p.confidence) ?? ''}>
            <option value="">Tümü</option>
            {['high', 'medium', 'low'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Atama
          <select className="input" name="assignment" defaultValue={one(p.assignment) ?? ''}>
            <option value="">Tümü</option>
            <option value="assigned">Atanmış</option>
            <option value="unassigned">Atanmamış</option>
          </select>
        </label>
        <label>
          Hakem kullanıcı ID
          <input className="input" name="reviewer" defaultValue={one(p.reviewer)} />
        </label>
        <label>
          Sayfa
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
              <th>Görev</th>
              <th>Öncelik</th>
              <th>Durum</th>
              <th>Konu</th>
              <th>Hedef / Eylem</th>
              <th>Yetkinlik</th>
              <th>Güven</th>
              <th>Atama</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length ? (
              data.rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <code>{t.candidateId}</code>
                    <br />
                    <small>{t.id}</small>
                  </td>
                  <td>{t.reviewPriority}</td>
                  <td>
                    <span className="badge">{t.status}</span>
                  </td>
                  <td>{t.subjectType}</td>
                  <td>
                    {t.targetKey} · {t.action}
                  </td>
                  <td>{t.requiredCapability}</td>
                  <td>{t.candidateConfidence}</td>
                  <td>{t.assignmentCount}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="muted">
                  Görev bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav className="pagination">
        {data.page > 1 ? <Link href={href(data.page - 1)}>Önceki</Link> : null}
        <span>
          {data.page}/{Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        {data.page * data.pageSize < data.total ? (
          <Link href={href(data.page + 1)}>Sonraki</Link>
        ) : null}
      </nav>
    </>
  )
}
