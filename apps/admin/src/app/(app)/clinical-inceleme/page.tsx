import Link from 'next/link'
import { db } from '@ogun/db'
import {
  listClinicalTasksForPlatform,
  listReviewerInvitationsForPlatform,
  listReviewersForPlatform,
} from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'

export default async function ClinicalReviewOverviewPage() {
  const [ctx] = await Promise.all([
    requirePlatformPermission('clinical.tasks.read'),
    requirePlatformPermission('clinical.reviewers.read'),
  ])
  const [
    activeReviewers,
    pendingReviewers,
    invitations,
    pendingInvitations,
    unassignedP1,
    unassignedP2,
    assignedTasks,
    inReviewTasks,
  ] = await Promise.all([
    listReviewersForPlatform(db, { active: 'active' }),
    listReviewersForPlatform(db, { verificationStatus: 'pending' }),
    listReviewerInvitationsForPlatform(db),
    listReviewerInvitationsForPlatform(db, { status: 'pending' }),
    listClinicalTasksForPlatform(db, { priority: 'P1', assignmentState: 'unassigned' }),
    listClinicalTasksForPlatform(db, { priority: 'P2', assignmentState: 'unassigned' }),
    listClinicalTasksForPlatform(db, { status: 'assigned' }),
    listClinicalTasksForPlatform(db, { status: 'in_review' }),
  ])
  const canManage = ctx.permissions.includes('clinical.reviewers.manage')
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clinical Review</h1>
          <p className="muted">Hakem yaşam döngüsü, davetler ve görev atamaları</p>
        </div>
        {canManage ? (
          <Link className="button action-link" href="/clinical-inceleme/davetler/yeni">
            Yeni hakem daveti
          </Link>
        ) : null}
      </div>
      <ClinicalReviewNav active="/clinical-inceleme" />
      <div className="cards">
        <Link className="card" href="/clinical-inceleme/hakemler">
          <span className="muted">Aktif hakemler</span>
          <div className="metric">{activeReviewers.total}</div>
        </Link>
        <Link className="card" href="/clinical-inceleme/hakemler?verification=pending">
          <span className="muted">Doğrulama bekleyen</span>
          <div className="metric">{pendingReviewers.total}</div>
        </Link>
        <Link className="card" href="/clinical-inceleme/davetler?status=pending">
          <span className="muted">Bekleyen davetler</span>
          <div className="metric">{pendingInvitations.total}</div>
        </Link>
        <Link className="card" href="/clinical-inceleme/gorevler?priority=P1&assignment=unassigned">
          <span className="muted">Atanmamış P1</span>
          <div className="metric">{unassignedP1.total}</div>
        </Link>
        <Link className="card" href="/clinical-inceleme/gorevler?priority=P2&assignment=unassigned">
          <span className="muted">Atanmamış P2</span>
          <div className="metric">{unassignedP2.total}</div>
        </Link>
        <Link className="card" href="/clinical-inceleme/gorevler?status=in_review">
          <span className="muted">Aktif review</span>
          <div className="metric">{assignedTasks.total + inReviewTasks.total}</div>
        </Link>
      </div>
      <section className="section">
        <h2>Operasyon durumu</h2>
        <p className="muted">
          Toplam {invitations.total} davet kaydı bulunuyor. Hesap aktivasyonu ile mesleki doğrulama
          birbirinden bağımsız izlenir; platform personeli clinical reviewer sayılmaz.
        </p>
      </section>
    </>
  )
}
