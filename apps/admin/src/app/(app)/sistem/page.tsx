import Link from 'next/link'
import { db } from '@ogun/db'
import { getSystemOperationsSummary } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { SubmitButton } from '@/components/submit-button'
import { acknowledgeFindingAction, runReconciliationAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const JOB_LABELS: Record<string, string> = {
  sms_reminders: 'SMS Hatırlatmaları', email_retry: 'E-posta Yeniden Deneme',
  subscription_reconciliation: 'Abonelik Kontrolü', maintenance: 'Bakım',
}

function statusClass(status: string) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'failure'
  return 'warning'
}

export default async function SystemStatusPage({ searchParams }: { searchParams: Promise<{ mesaj?: string }> }) {
  const ctx = await requirePlatformPermission('system.read')
  const data = await getSystemOperationsSummary(db)
  const { mesaj } = await searchParams
  const canManage = ctx.permissions.includes('system.manage')
  const deploymentEnvironment = process.env.VERCEL_ENV === 'production' || process.env.APP_ENV === 'production'
    ? 'production' : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development'
  const deploymentId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.GIT_SHA?.slice(0, 12) ?? 'belirtilmedi'
  return <>
    <div className="page-head"><div><h1>Sistem Durumu</h1><p className="muted">Gerçek operasyon kayıtları · hassas veri içermez</p></div>
      {canManage ? <form action={runReconciliationAction}><SubmitButton pending="Çalıştırılıyor…">Abonelik kontrolünü çalıştır</SubmitButton></form> : null}
    </div>
    {mesaj ? <p className="notice">{mesaj}</p> : null}
    <div className="cards">
      <article className="card"><span className="badge success">Hazır</span><h2>Database</h2><p className="muted">Bu ekranın sorgusu başarılı.</p></article>
      <article className="card"><span className="badge success">Yanıt veriyor</span><h2>Admin application</h2><p className="muted">Sunucu tarafında üretildi.</p></article>
      <article className="card"><span className="badge warning">Yapılandırma</span><h2>Web application</h2><p className="muted">{process.env.OGUN_WEB_URL ? 'Adres yapılandırılmış; health endpoint ayrıca izlenmeli.' : 'OGUN_WEB_URL eksik.'}</p></article>
      <article className="card"><span className="badge">{deploymentEnvironment}</span><h2>Deployment</h2><p className="muted">{deploymentId}</p></article>
    </div>
    <section className="section"><h2>Dikkat Gerektirenler</h2><div className="cards">
      <article className="card"><span className="muted">Kritik</span><div className="metric">{data.counts.openCritical}</div></article>
      <article className="card"><span className="muted">Uyarı</span><div className="metric">{data.counts.openWarnings}</div></article>
      <article className="card"><span className="muted">Belirsiz SMS</span><div className="metric">{data.counts.unknownSms}</div></article>
      <article className="card"><span className="muted">Terminal SMS</span><div className="metric">{data.counts.terminalSms}</div></article>
      <article className="card"><span className="muted">Terminal e-posta</span><div className="metric">{data.counts.terminalEmail}</div></article>
      <article className="card"><span className="muted">Hatalı webhook</span><div className="metric">{data.counts.failedWebhooks}</div></article>
    </div></section>
    <section className="section"><div className="page-head compact-head"><div><h2>Zamanlanmış İşler</h2><p className="muted">Son kalıcı çalışma kayıtları</p></div><Link className="table-link" href="/sistem/isler">Tüm geçmiş</Link></div>
      <div className="cards">
        <article className="card"><span className="muted">Aktif lease</span><div className="metric">{data.counts.activeJobLeases}</div></article>
        <article className="card"><span className="muted">Çalışan iş kaydı</span><div className="metric">{data.counts.runningJobs}</div></article>
      </div>
      <div className="table-wrap"><table><thead><tr><th>İş</th><th>Durum</th><th>Tetikleyici</th><th>Başlangıç</th><th>Sonuç</th></tr></thead><tbody>
        {data.latestRuns.length ? data.latestRuns.map((run) => <tr key={run.id}><td><Link className="table-link" href={`/sistem/isler/${run.id}`}>{JOB_LABELS[run.jobName] ?? run.jobName}</Link></td><td><span className={`badge ${statusClass(run.status)}`}>{run.status}</span></td><td>{run.trigger}</td><td>{run.startedAt.toLocaleString('tr-TR')}</td><td>{run.succeededCount} başarılı · {run.failedCount} hata · {run.skippedCount} atlandı</td></tr>) : <tr><td colSpan={5} className="muted">Henüz çalışma kaydı yok.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="section"><h2>Teslimatlar ve webhooklar</h2><div className="cards">
      <article className="card"><span className="muted">Bekleyen e-posta</span><div className="metric">{data.counts.pendingEmail}</div></article>
      <article className="card"><span className="muted">Destek e-postası</span><div className="metric">{data.counts.supportPendingEmail}</div></article>
      <article className="card"><span className="muted">Abonelik e-postası</span><div className="metric">{data.counts.subscriptionPendingEmail}</div></article>
      <article className="card"><span className="muted">Bekleyen SMS</span><div className="metric">{data.counts.pendingSms}</div></article>
      <article className="card"><span className="muted">İşlenen SMS</span><div className="metric">{data.counts.processingSms}</div></article>
      <article className="card"><span className="muted">Yeniden denenecek SMS</span><div className="metric">{data.counts.retryableSms}</div></article>
      <article className="card"><span className="muted">İşlenen webhook</span><div className="metric">{data.counts.processingWebhooks}</div></article>
      <article className="card"><span className="muted">Duplicate webhook</span><div className="metric">{data.counts.duplicateWebhooks}</div></article>
      <article className="card"><span className="muted">Son webhook</span><p>{data.lastWebhook?.receivedAt.toLocaleString('tr-TR') ?? 'Henüz yok'}</p></article>
    </div></section>
    <section className="section"><h2>Operasyon Bulguları</h2><div className="table-wrap"><table><thead><tr><th>Önem</th><th>Özet</th><th>Varlık</th><th>Son görülme</th><th>Durum</th><th></th></tr></thead><tbody>
      {data.findings.length ? data.findings.map((finding) => <tr key={finding.id}><td><span className={`badge ${finding.severity === 'critical' ? 'failure' : 'warning'}`}>{finding.severity}</span></td><td className="wrap-cell">{finding.summary}</td><td>{finding.entityType}</td><td>{finding.lastSeenAt.toLocaleString('tr-TR')}</td><td>{finding.status}</td><td>{canManage && finding.status === 'open' ? <form action={acknowledgeFindingAction}><input type="hidden" name="findingId" value={finding.id}/><SubmitButton pending="Kaydediliyor…">Görüldü</SubmitButton></form> : null}</td></tr>) : <tr><td colSpan={6} className="muted">Açık bulgu yok.</td></tr>}
    </tbody></table></div></section>
  </>
}
