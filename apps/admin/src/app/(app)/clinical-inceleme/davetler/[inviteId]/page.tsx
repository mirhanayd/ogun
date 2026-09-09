import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getReviewerInvitationForPlatform,
  listEligibleTasksForPlatform,
  type ClinicalAssignmentRole,
  type ClinicalProfessionalRole,
  type ClinicalReviewerCapability,
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
  cancelInvitationTaskAction,
  resendReviewerInvitationAction,
  revokeReviewerInvitationAction,
  stageInvitationTasksAction,
  updateInvitationCapabilitiesAction,
} from '../../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function ReviewerInvitationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('clinical.reviewers.read')
  const { inviteId } = await params
  const query = await searchParams
  const invitation = await getReviewerInvitationForPlatform(db, inviteId)
  if (!invitation) notFound()
  const assignmentRole = (
    CLINICAL_ASSIGNMENT_ROLES.includes(one(query.assignmentRole) as ClinicalAssignmentRole)
      ? one(query.assignmentRole)
      : 'primary'
  ) as ClinicalAssignmentRole
  const tasks = await listEligibleTasksForPlatform(db, {
    validate: clinicalTaskValidator(
      invitation.professionalRole as ClinicalProfessionalRole,
      invitation.capabilities as ClinicalReviewerCapability[],
    ),
    assignmentRole,
    search: one(query.q),
    priority: one(query.priority),
    status: one(query.taskStatus),
    requiredCapability: one(query.capability),
    subjectType: one(query.subjectType),
    page: Number(one(query.page) ?? 1),
    pageSize: 25,
  })
  const canManage = ctx.permissions.includes('clinical.reviewers.manage'),
    canAssign = ctx.permissions.includes('clinical.tasks.assign'),
    mutable = invitation.displayStatus === 'pending'
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/clinical-inceleme/davetler">Davetler</Link> / {invitation.name}
      </div>
      <div className="page-head">
        <div>
          <h1>{invitation.name}</h1>
          <p className="muted">{invitation.email}</p>
        </div>
        <div className="header-badges">
          <span className="badge">{invitation.displayStatus}</span>
          <span
            className={`badge ${invitation.emailDeliveryStatus === 'sent' ? 'success' : invitation.emailDeliveryStatus === 'failed' ? 'failure' : ''}`}
          >
            E-posta: {invitation.emailDeliveryStatus}
          </span>
        </div>
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/davetler" />
      <OperationFeedback message={one(query.mesaj)} error={one(query.hata)} />
      <section className="card">
        <dl className="detail-grid">
          <div>
            <dt>Meslek</dt>
            <dd>{invitation.professionalRole}</dd>
          </div>
          <div>
            <dt>Uzmanlık</dt>
            <dd>{invitation.specialty ?? '—'}</dd>
          </div>
          <div>
            <dt>Mesleki doğrulama</dt>
            <dd>
              {invitation.professionalVerificationConfirmed
                ? 'Önceden doğrulandı'
                : 'Kabul sonrası bekleyecek'}
            </dd>
          </div>
          <div>
            <dt>Hesap</dt>
            <dd>{invitation.acceptedByUserId ? 'Aktif edildi' : 'Henüz kabul edilmedi'}</dd>
          </div>
          <div>
            <dt>Sona erme</dt>
            <dd>{invitation.expiresAt.toLocaleString('tr-TR')}</dd>
          </div>
          <div>
            <dt>E-posta denemesi</dt>
            <dd>{invitation.emailAttemptCount}</dd>
          </div>
        </dl>
        {invitation.lastEmailError ? (
          <p className="error">Son e-posta hatası: {invitation.lastEmailError}</p>
        ) : null}
      </section>
      {canManage && mutable ? (
        <section className="section action-panels">
          <form action={updateInvitationCapabilitiesAction} className="card stack">
            <h2>Yetkinlikleri güncelle</h2>
            <input type="hidden" name="invitationId" value={inviteId} />
            <div className="check-grid">
              {CLINICAL_REVIEWER_CAPABILITIES.map((cap) => (
                <label key={cap}>
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={cap}
                    defaultChecked={(invitation.capabilities as string[]).includes(cap)}
                  />{' '}
                  <code>{cap}</code>
                </label>
              ))}
            </div>
            <button className="button">Kaydet ve staging uygunluğunu yenile</button>
          </form>
          <div className="card stack">
            <h2>Davet işlemleri</h2>
            <form action={resendReviewerInvitationAction}>
              <input type="hidden" name="invitationId" value={inviteId} />
              <button className="button">Davet bağlantısını yeniden gönder</button>
            </form>
            <form action={revokeReviewerInvitationAction} className="compact-form">
              <input type="hidden" name="invitationId" value={inviteId} />
              <input
                className="input"
                name="reason"
                required
                minLength={3}
                placeholder="İptal nedeni"
              />
              <button className="button danger-button">Davet iptal et</button>
            </form>
          </div>
        </section>
      ) : null}
      <section className="section">
        <h2>Ayrılmış görevler</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görev</th>
                <th>Öncelik</th>
                <th>Yetkinlik</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {invitation.assignments.length ? (
                invitation.assignments.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <code>{item.taskId}</code>
                      <br />
                      <small>{item.targetKey}</small>
                    </td>
                    <td>{item.reviewPriority}</td>
                    <td>{item.requiredCapability}</td>
                    <td>{item.assignmentRole}</td>
                    <td>
                      <span className="badge">{item.status}</span>
                      {item.invalidationReason ? (
                        <>
                          <br />
                          <small>{item.invalidationReason}</small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {canAssign && item.status === 'pending' ? (
                        <form action={cancelInvitationTaskAction}>
                          <input type="hidden" name="invitationId" value={inviteId} />
                          <input type="hidden" name="stagingId" value={item.id} />
                          <button className="button danger-button">İptal et</button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    Henüz görev ayrılmadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {canAssign && mutable ? (
        <section className="section">
          <h2>Bu uzmana uygun incelemeler</h2>
          <form className="filter-grid" method="get">
            <label>
              Arama
              <input className="input" name="q" defaultValue={one(query.q)} />
            </label>
            <label>
              Öncelik
              <select className="input" name="priority" defaultValue={one(query.priority) ?? ''}>
                <option value="">Tümü</option>
                {['P1', 'P2', 'P3', 'P4', 'P5'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Durum
              <input className="input" name="taskStatus" defaultValue={one(query.taskStatus)} />
            </label>
            <label>
              Yetkinlik
              <select
                className="input"
                name="capability"
                defaultValue={one(query.capability) ?? ''}
              >
                <option value="">Tümü</option>
                {CLINICAL_REVIEWER_CAPABILITIES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Konu
              <select
                className="input"
                name="subjectType"
                defaultValue={one(query.subjectType) ?? ''}
              >
                <option value="">Tümü</option>
                <option value="medication">İlaç</option>
                <option value="condition">Durum</option>
              </select>
            </label>
            <label>
              Atama rolü
              <select className="input" name="assignmentRole" defaultValue={assignmentRole}>
                {CLINICAL_ASSIGNMENT_ROLES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button className="button">Filtrele</button>
          </form>
          <form action={stageInvitationTasksAction}>
            <input type="hidden" name="invitationId" value={inviteId} />
            <input type="hidden" name="assignmentRole" value={assignmentRole} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Seç</th>
                    <th>Görev</th>
                    <th>Öncelik</th>
                    <th>Durum</th>
                    <th>Konu</th>
                    <th>Yetkinlik</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.rows.length ? (
                    tasks.rows.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <input type="checkbox" name="taskIds" value={task.id} />
                        </td>
                        <td>
                          <code>{task.candidateId}</code>
                          <br />
                          <small>
                            {task.targetKey} · {task.action}
                          </small>
                        </td>
                        <td>{task.reviewPriority}</td>
                        <td>{task.status}</td>
                        <td>{task.subjectType}</td>
                        <td>{task.requiredCapability}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="muted">
                        Uygun görev bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button className="button section">Seçilenleri ata</button>
          </form>
        </section>
      ) : null}
    </>
  )
}
