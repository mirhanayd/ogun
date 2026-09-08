import Link from 'next/link'
import { db } from '@ogun/db'
import { listPlatformAuditLogs } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ sayfa?: string }> }) {
  await requirePlatformPermission('audit.read')
  const requested = Number((await searchParams).sayfa ?? 1)
  const page = Number.isFinite(requested) ? Math.max(1, Math.trunc(requested)) : 1
  const data = await listPlatformAuditLogs(db, page, 50)
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  return (
    <>
      <div className="page-head"><div><h1>Platform denetimi</h1><p className="muted">Append-only operasyon olayları · {data.total} kayıt</p></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tarih</th><th>Aktör</th><th>Action</th><th>Entity</th><th>Clinic</th><th>Outcome</th><th>IP</th><th>Detay</th></tr></thead>
          <tbody>
            {data.rows.length === 0 ? <tr><td colSpan={8} className="muted">Henüz denetim kaydı yok.</td></tr> : data.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt.toLocaleString('tr-TR')}</td>
                <td>{row.actorName ?? 'Sistem'}<br /><small className="muted">{row.actorEmail}</small></td>
                <td><code>{row.action}</code></td>
                <td>{row.entityType}{row.entityId ? ` / ${row.entityId}` : ''}</td>
                <td>{row.clinicId ?? '—'}</td>
                <td><span className={`badge ${row.outcome}`}>{row.outcome}</span></td>
                <td>{row.ipAddress ?? '—'}</td>
                <td><details><summary>Göster</summary><p><strong>Neden:</strong> {row.reason ?? '—'}</p><p><strong>User agent:</strong> {row.userAgent ?? '—'}</p><pre>{JSON.stringify(row.metadata ?? {}, null, 2)}</pre></details></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="Sayfalama">
        {page > 1 ? <Link href={`/denetim?sayfa=${page - 1}`}>Önceki</Link> : null}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={`/denetim?sayfa=${page + 1}`}>Sonraki</Link> : null}
      </nav>
    </>
  )
}
