export interface ClinicalReviewerInvitationEmailData {
  email: string
  name: string
  professionalRole: string
  specialty: string | null
  invitationUrl: string
  expiresAt: Date
}

export interface ClinicalReviewerVerificationEmailData {
  email: string
  name: string
  assignedReviewsUrl: string
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!,
  )
}

export function buildClinicalReviewerInvitationEmail(data: ClinicalReviewerInvitationEmailData) {
  const name = escapeHtml(data.name)
  const url = escapeHtml(data.invitationUrl)
  const expiry = data.expiresAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
  const specialty = data.specialty ?? 'Belirtilmedi'
  return {
    to: data.email,
    subject: 'Ogun Clinical Review davetiniz',
    text: `Merhaba ${data.name},\n\nOgun Clinical Review sistemine uzman hakem olarak davet edildiniz.\nMeslek: ${data.professionalRole}\nUzmanlık alanı: ${specialty}\n\nHesabınızı etkinleştirmek için:\n${data.invitationUrl}\n\nBu bağlantı 7 gün boyunca geçerlidir, tek kullanımlıktır ve ${expiry} tarihinde sona erer. Görev veya klinik içerik bu e-postada paylaşılmaz.`,
    html: `<p>Merhaba ${name},</p><p>Ogun Clinical Review sistemine uzman hakem olarak davet edildiniz.</p><p><strong>Meslek:</strong> ${escapeHtml(data.professionalRole)}<br><strong>Uzmanlık alanı:</strong> ${escapeHtml(specialty)}</p><p><a href="${url}">Daveti kabul et</a></p><p>Bu bağlantı 7 gün boyunca geçerlidir, tek kullanımlıktır ve ${escapeHtml(expiry)} tarihinde sona erer.</p><p>Görev veya klinik içerik bu e-postada paylaşılmaz.</p>`,
  }
}

export function buildClinicalReviewerVerificationEmail(
  data: ClinicalReviewerVerificationEmailData,
) {
  const name = escapeHtml(data.name)
  const url = escapeHtml(data.assignedReviewsUrl)
  return {
    to: data.email,
    subject: 'Ogun Clinical Review erişiminiz etkinleştirildi',
    text: `Merhaba ${data.name},\n\nMesleki doğrulamanız tamamlandı. Size atanmış incelemeleri görüntüleyebilirsiniz:\n${data.assignedReviewsUrl}`,
    html: `<p>Merhaba ${name},</p><p>Mesleki doğrulamanız tamamlandı. Size atanmış incelemeleri artık görüntüleyebilirsiniz.</p><p><a href="${url}">İncelemelerimi görüntüle</a></p>`,
  }
}
