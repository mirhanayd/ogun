import { ClinicalReviewNav } from '@/components/clinical-review-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { requirePlatformPermission } from '@/lib/platform-authz'
import {
  CLINICAL_PROFESSIONAL_ROLES,
  CLINICAL_REVIEWER_CAPABILITIES,
  PROFESSIONAL_ROLE_LABELS,
} from '@/lib/clinical-review-model'
import { createReviewerInvitationAction } from '../../actions'

export default async function NewReviewerInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string; mesaj?: string }>
}) {
  await requirePlatformPermission('clinical.reviewers.manage')
  const feedback = await searchParams
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Yeni hakem daveti</h1>
          <p className="muted">Hesap aktivasyonu ve mesleki doğrulama ayrı durumlardır.</p>
        </div>
      </div>
      <ClinicalReviewNav active="/clinical-inceleme/davetler" />
      <OperationFeedback message={feedback.mesaj} error={feedback.hata} />
      <form action={createReviewerInvitationAction} className="card stack reviewer-form">
        <div className="detail-grid">
          <label className="field">
            Ad soyad
            <input className="input" name="name" required maxLength={100} />
          </label>
          <label className="field">
            E-posta
            <input className="input" name="email" type="email" required />
          </label>
          <label className="field">
            Meslek
            <select className="input" name="professionalRole" required>
              {CLINICAL_PROFESSIONAL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PROFESSIONAL_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Uzmanlık alanı
          <input
            className="input"
            name="specialty"
            maxLength={120}
            placeholder="Örn. Klinik Eczacılık"
          />
          <small className="muted">Açıklayıcı metadadır; tek başına yetkilendirme sağlamaz.</small>
        </label>
        <fieldset>
          <legend>Yetkinlikler (açık seçim zorunlu)</legend>
          <div className="check-grid">
            {CLINICAL_REVIEWER_CAPABILITIES.map((cap) => (
              <label key={cap}>
                <input type="checkbox" name="capabilities" value={cap} /> <code>{cap}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="verification-check">
          <input type="checkbox" name="professionalVerificationConfirmed" /> Bu uzmanın mesleki
          yeterliliğini doğruladım
        </label>
        <p className="muted">
          İşaretlenmezse hesap kabul edildiğinde reviewer pending/inactive olur ve klinik içeriğe
          erişemez.
        </p>
        <button className="button">Daveti oluştur ve gönder</button>
      </form>
    </>
  )
}
