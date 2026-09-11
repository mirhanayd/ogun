import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getOperationalJobRun } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'

export default async function JobRunPage({ params }: { params: Promise<{ runId: string }> }) {
  await requirePlatformPermission('system.read')
  const run = await getOperationalJobRun(db, (await params).runId)
  if (!run) notFound()
  const duration = run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null
  return <><div className="breadcrumbs"><Link href="/sistem">Sistem Durumu</Link> / <Link href="/sistem/isler">İşler</Link> / Çalışma</div><h1>{run.jobName}</h1>
    <article className="card"><dl className="detail-grid"><div><dt>Durum</dt><dd>{run.status}</dd></div><div><dt>Tetikleyici</dt><dd>{run.trigger}</dd></div><div><dt>Başlangıç</dt><dd>{run.startedAt.toLocaleString('tr-TR')}</dd></div><div><dt>Süre</dt><dd>{duration === null ? 'Devam ediyor' : `${duration} ms`}</dd></div><div><dt>Denendi</dt><dd>{run.attemptedCount}</dd></div><div><dt>Başarılı / Hata / Atlandı</dt><dd>{run.succeededCount} / {run.failedCount} / {run.skippedCount}</dd></div><div><dt>Güvenli hata kodu</dt><dd>{run.errorCode ?? '—'}</dd></div><div><dt>Güvenli özet</dt><dd>{run.errorSummary ?? '—'}</dd></div></dl></article></>
}
