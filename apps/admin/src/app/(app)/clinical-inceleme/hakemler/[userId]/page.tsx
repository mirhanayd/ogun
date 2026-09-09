import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getReviewerForPlatform,
  listEligibleTasksForPlatform,
  type ClinicalAssignmentRole,
  type ClinicalProfessionalRole,
} from '@ogun/db/queries'
import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { requirePlatformPermission } from '@/lib/platform-authz'
import {
  CLINICAL_ASSIGNMENT_ROLES,
  CLINICAL_REVIEWER_CAPABILITIES,
  clinicalTaskValidator,
} from '@/lib/clinical-review-model'
import {
  assignTasksToReviewerAction,
  cancelReviewerAssignmentAction,
  transitionReviewerStatusAction,
  updateReviewerCapabilitiesAction,
} from '../../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function ReviewerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('clinical.reviewers.read')
  const { userId } = await params
  const q = await searchParams
  const reviewer = await getReviewerForPlatform(db, userId)
  if (!reviewer) notFound()
  const role = (
    CLINICAL_ASSIGNMENT_ROLES.includes(one(q.assignmentRole) as ClinicalAssignmentRole)
      ? one(q.assignmentRole)
      : 'primary'
  ) as ClinicalAssignmentRole
  const tasks = await listEligibleTasksForPlatform(db, {
    validate: clinicalTaskValidator(
      reviewer.professionalRole as ClinicalProfessionalRole,
      reviewer.capabilities,
    ),
    assignmentRole: role,
    search: one(q.q),
    priority: one(q.priority),
    status: one(q.taskStatus),
    requiredCapability: one(q.capability),
    subjectType: one(q.subjectType),
    page: 1,
    pageSize: 25,
  })
  const canManage = ctx.permissions.includes('clinical.reviewers.manage'),
    canAssign = ctx.permissions.includes('clinical.tasks.assign')
  const transitions: Record<string, string[]> = {
    pending: ['verified', 'rejected'],
    verified: ['suspended'],
    suspended: ['verified'],
    rejected: ['pending'],
  }
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/clinical-inceleme/hakemler">Hakemler</Link> / {reviewer.userName}
      </div>
      <div className="page-head">
        <div>
          <h1>{reviewer.userName}</h1>
          <p className="muted">{reviewer.userEmail}</p>
        </div>
        <div className="header-badges">
          <span className="badge">{reviewer.verificationStatus}</span>
          <span className={`badge ${reviewer.isActive ? 'success' : 'failure'}`}>
            {reviewer.isActive ? 'Aktif' : 'Pasif'}
          </span>
        </div>
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/hakemler" />
      <OperationFeedback message={one(q.mesaj)} error={one(q.hata)} />
      <section className="card">
        <dl className="detail-grid">
          <div>
            <dt>Meslek</dt>
            <dd>{reviewer.professionalRole}</dd>
          </div>
          <div>
            <dt>Uzmanlık</dt>
            <dd>{reviewer.specialty ?? '—'}</dd>
          </div>
          <div>
            <dt>Doğrulandı</dt>
            <dd>{reviewer.verifiedAt?.toLocaleString('tr-TR') ?? '—'}</dd>
          </div>
          <div>
            <dt>Yayın yetkisi</dt>
            <dd>{reviewer.canPublish ? 'Var' : 'Yok (salt okunur)'}</dd>
          </div>
          <div>
            <dt>Oluşturuldu</dt>
            <dd>{reviewer.createdAt.toLocaleString('tr-TR')}</dd>
          </div>
          <div>
            <dt>Güncellendi</dt>
            <dd>{reviewer.updatedAt.toLocaleString('tr-TR')}</dd>
          </div>
        </dl>
      </section>
      {canManage ? (
        <section className="section action-panels">
          <form className="card stack" action={transitionReviewerStatusAction}>
            <h2>Durum değiştir</h2>
            <input type="hidden" name="userId" value={userId} />
            <select className="input" name="toStatus">
              {(transitions[reviewer.verificationStatus] ?? []).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <input className="input" name="reason" placeholder="Ret/askıya alma nedeni" />
            <button className="button">Durumu güncelle</button>
          </form>
          <form className="card stack" action={updateReviewerCapabilitiesAction}>
            <h2>Yetkinlikler</h2>
            <input type="hidden" name="userId" value={userId} />
            <div className="check-grid">
              {CLINICAL_REVIEWER_CAPABILITIES.map((cap) => (
                <label key={cap}>
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={cap}
                    defaultChecked={reviewer.capabilities.includes(cap)}
                  />{' '}
                  <code>{cap}</code>
                </label>
              ))}
            </div>
            <p className="muted">
              Uyumsuz mevcut atamalar silinmez; kayıttan sonra sayı raporlanır.
            </p>
            <button className="button">Yetkinlikleri kaydet</button>
          </form>
        </section>
      ) : null}
      <section className="section">
        <h2>Atama geçmişi</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görev</th>
                <th>Öncelik</th>
                <th>Yetkinlik</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>Atandı</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {reviewer.assignments.length ? (
                reviewer.assignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <code>{a.taskId}</code>
                      <br />
                      <small>{a.targetKey}</small>
                    </td>
                    <td>{a.reviewPriority}</td>
                    <td>{a.requiredCapability}</td>
                    <td>{a.assignmentRole}</td>
                    <td>{a.status}</td>
                    <td>{a.assignedAt.toLocaleString('tr-TR')}</td>
                    <td>
                      {canAssign && (a.status === 'assigned' || a.status === 'in_progress') ? (
                        <form action={cancelReviewerAssignmentAction} className="compact-form">
                          <input type="hidden" name="userId" value={userId} />
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input
                            className="input compact-input"
                            name="reason"
                            required
                            minLength={3}
                            placeholder="İptal nedeni"
                          />
                          <button className="button danger-button">Atamayı iptal et</button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    Atama yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>İnceleme geçmişi</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görev</th>
                <th>Karar</th>
                <th>Şiddet</th>
                <th>Kanıt gücü</th>
                <th>Not</th>
                <th>Güncellendi</th>
              </tr>
            </thead>
            <tbody>
              {reviewer.decisions.length ? (
                reviewer.decisions.map((decision) => (
                  <tr key={decision.id}>
                    <td>
                      <code>{decision.taskId}</code>
                    </td>
                    <td>{decision.decision}</td>
                    <td>{decision.severity ?? '—'}</td>
                    <td>{decision.evidenceStrength ?? '—'}</td>
                    <td>{decision.reviewNote ?? '—'}</td>
                    <td>{decision.updatedAt.toLocaleString('tr-TR')}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    Tamamlanmış inceleme yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {canAssign && reviewer.verificationStatus === 'verified' && reviewer.isActive ? (
        <section className="section">
          <h2>Uygun görev ata</h2>
          <form className="filter-grid">
            <label>
              Arama
              <input className="input" name="q" defaultValue={one(q.q)} />
            </label>
            <label>
              Öncelik
              <input className="input" name="priority" defaultValue={one(q.priority)} />
            </label>
            <label>
              Atama rolü
              <select className="input" name="assignmentRole" defaultValue={role}>
                {CLINICAL_ASSIGNMENT_ROLES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button className="button">Filtrele</button>
          </form>
          <form action={assignTasksToReviewerAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="assignmentRole" value={role} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Seç</th>
                    <th>Görev</th>
                    <th>Öncelik</th>
                    <th>Durum</th>
                    <th>Yetkinlik</th>
                    <th>Atama</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.rows.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input type="checkbox" name="taskIds" value={t.id} />
                      </td>
                      <td>
                        <code>{t.candidateId}</code>
                        <br />
                        <small>{t.targetKey}</small>
                      </td>
                      <td>{t.reviewPriority}</td>
                      <td>{t.status}</td>
                      <td>{t.requiredCapability}</td>
                      <td>Uygun</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="button section">Seçilen görevleri ata</button>
          </form>
        </section>
      ) : null}
    </>
  )
}
