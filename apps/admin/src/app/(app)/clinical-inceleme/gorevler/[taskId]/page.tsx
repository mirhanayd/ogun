import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getClinicalReviewTaskById,
  listClinicalTaskAssignmentsForPlatform,
  listReviewersForPlatform,
} from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { CLINICAL_ASSIGNMENT_ROLES } from '@/lib/clinical-review-model'
import { assignTaskToReviewerAction, cancelReviewerAssignmentAction } from '../../actions'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function ClinicalTaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('clinical.tasks.read')
  const { taskId } = await params
  const query = await searchParams
  const task = await getClinicalReviewTaskById(db, taskId)
  if (!task) notFound()

  const [assignments, reviewers] = await Promise.all([
    listClinicalTaskAssignmentsForPlatform(db, taskId),
    ctx.permissions.includes('clinical.tasks.assign')
      ? listReviewersForPlatform(db, { page: 1, pageSize: 100 })
      : Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 100 as const }),
  ])
  const canAssign = ctx.permissions.includes('clinical.tasks.assign')
  const assignmentRole = CLINICAL_ASSIGNMENT_ROLES.includes(one(query.assignmentRole) as typeof CLINICAL_ASSIGNMENT_ROLES[number])
    ? one(query.assignmentRole) as typeof CLINICAL_ASSIGNMENT_ROLES[number]
    : 'primary'

  return (
    <>
      <div className="breadcrumbs">
        <Link href="/clinical-inceleme/gorevler">Görevler</Link> / {task.candidateId}
      </div>
      <div className="page-head">
        <div>
          <h1>{task.candidateId}</h1>
          <p className="muted">{task.targetKey} · {task.action}</p>
        </div>
        <div className="header-badges">
          <span className="badge">{task.status}</span>
          <span className="badge">{task.reviewPriority}</span>
        </div>
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/gorevler" />
      <OperationFeedback message={one(query.mesaj)} error={one(query.hata)} />
      <section className="card">
        <dl className="detail-grid">
          <div><dt>Konu</dt><dd>{task.subjectType}</dd></div>
          <div><dt>Hedef türü</dt><dd>{task.targetType}</dd></div>
          <div><dt>Gerekli yetkinlik</dt><dd>{task.requiredCapability}</dd></div>
          <div><dt>Güven</dt><dd>{task.candidateConfidence}</dd></div>
          <div><dt>Kanıt</dt><dd>{task.evidenceCount} kanıt · {task.sourceDocumentCount} kaynak</dd></div>
          <div><dt>Kaynak</dt><dd>{task.sourceSystem}</dd></div>
          <div><dt>Oluşturuldu</dt><dd>{task.createdAt.toLocaleString('tr-TR')}</dd></div>
          <div><dt>Güncellendi</dt><dd>{task.updatedAt.toLocaleString('tr-TR')}</dd></div>
          <div><dt>Artifact konumu</dt><dd className="wrap-cell">{task.artifactLocator ?? '—'}</dd></div>
        </dl>
      </section>
      <section className="section">
        <h2>Mevcut atamalar</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Hakem</th><th>Rol</th><th>Durum</th><th>Atanma</th><th>Aksiyon</th></tr></thead>
            <tbody>
              {assignments.length ? assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td><Link className="table-link" href={`/clinical-inceleme/hakemler/${assignment.reviewerUserId}`}>{assignment.reviewerName}</Link><br /><small>{assignment.reviewerEmail}</small></td>
                  <td>{assignment.assignmentRole}</td>
                  <td><span className="badge">{assignment.status}</span></td>
                  <td>{assignment.assignedAt.toLocaleString('tr-TR')}</td>
                  <td>{canAssign && (assignment.status === 'assigned' || assignment.status === 'in_progress') ? <form action={cancelReviewerAssignmentAction} className="compact-form"><input type="hidden" name="userId" value={assignment.reviewerUserId} /><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="returnTo" value={`/clinical-inceleme/gorevler/${task.id}`} /><input className="input compact-input" name="reason" required minLength={3} placeholder="İptal nedeni" /><button className="button danger-button">İptal et</button></form> : '—'}</td>
                </tr>
              )) : <tr><td colSpan={5} className="muted">Bu göreve henüz hakem atanmamış.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {canAssign ? (
        <section className="section">
          <h2>Hakeme ata</h2>
          <p className="muted">Uygunluk kontrolü atama sırasında tekrar yapılır; doğrulanmamış, pasif veya yetkinliği yetersiz hakemler reddedilir.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Hakem</th><th>Meslek</th><th>Durum</th><th>Yetkinlikler</th><th>Aksiyon</th></tr></thead>
              <tbody>{reviewers.rows.map((reviewer) => <tr key={reviewer.userId}><td><Link className="table-link" href={`/clinical-inceleme/hakemler/${reviewer.userId}`}>{reviewer.userName}</Link><br /><small>{reviewer.userEmail}</small></td><td>{reviewer.professionalRole}</td><td>{reviewer.verificationStatus} · {reviewer.isActive ? 'aktif' : 'pasif'}</td><td className="wrap-cell">{reviewer.capabilities.join(', ') || '—'}</td><td><form action={assignTaskToReviewerAction} className="compact-form"><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="userId" value={reviewer.userId} /><label className="field"><span>Rol</span><select className="input compact-input" name="assignmentRole" defaultValue={assignmentRole}>{CLINICAL_ASSIGNMENT_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label><button className="button">Bu hakeme ata</button></form></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
