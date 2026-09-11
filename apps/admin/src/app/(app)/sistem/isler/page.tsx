import Link from 'next/link'
import { db } from '@ogun/db'
import { getSystemOperationsSummary } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'

export default async function JobRunsPage() {
  await requirePlatformPermission('system.read')
  const { recentRuns } = await getSystemOperationsSummary(db)
  return <><div className="breadcrumbs"><Link href="/sistem">Sistem Durumu</Link> / İşler</div><h1>İş Geçmişi</h1>
    <div className="table-wrap"><table><thead><tr><th>İş</th><th>Durum</th><th>Tetikleyici</th><th>Başlangıç</th><th>Denendi</th><th>Başarılı</th><th>Hata</th><th>Atlandı</th></tr></thead><tbody>
      {recentRuns.map((run) => <tr key={run.id}><td><Link className="table-link" href={`/sistem/isler/${run.id}`}>{run.jobName}</Link></td><td>{run.status}</td><td>{run.trigger}</td><td>{run.startedAt.toLocaleString('tr-TR')}</td><td>{run.attemptedCount}</td><td>{run.succeededCount}</td><td>{run.failedCount}</td><td>{run.skippedCount}</td></tr>)}
    </tbody></table></div></>
}
