import type { SendEmailInput } from './types'

export interface SubscriptionOperationEmailData {
  recipientEmail: string
  clinicName: string
  eventType: string
  payload: Record<string, unknown> | null
}

const LABELS: Record<string, string> = {
  trial_extended: 'Deneme süreniz uzatıldı',
  plan_changed: 'Ogun aboneliğiniz güncellendi',
  billing_cycle_changed: 'Faturalama döneminiz güncellendi',
  cancel_requested: 'Abonelik iptal talebiniz kaydedildi',
  cancel_request_reverted: 'Abonelik iptal talebiniz geri alındı',
  status_corrected: 'Ogun abonelik durumunuz güncellendi',
}

function safe(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function details(data: SubscriptionOperationEmailData) {
  const payload = data.payload ?? {}
  const rows: string[] = []
  if (data.eventType === 'trial_extended') {
    if (safe(payload.days)) rows.push(`Uzatma: ${safe(payload.days)} gün`)
    if (safe(payload.newTrialEndsAt))
      rows.push(`Yeni deneme bitişi: ${safe(payload.newTrialEndsAt)}`)
  }
  if (data.eventType === 'plan_changed') {
    if (safe(payload.fromPlan)) rows.push(`Önceki plan: ${safe(payload.fromPlan)}`)
    if (safe(payload.toPlan)) rows.push(`Yeni plan: ${safe(payload.toPlan)}`)
  }
  if (data.eventType === 'billing_cycle_changed') {
    if (safe(payload.fromBillingCycle))
      rows.push(`Önceki faturalama: ${safe(payload.fromBillingCycle)}`)
    if (safe(payload.toBillingCycle)) rows.push(`Yeni faturalama: ${safe(payload.toBillingCycle)}`)
  }
  if (data.eventType === 'status_corrected') {
    if (safe(payload.fromStatus)) rows.push(`Önceki durum: ${safe(payload.fromStatus)}`)
    if (safe(payload.toStatus)) rows.push(`Yeni durum: ${safe(payload.toStatus)}`)
  }
  if (data.eventType === 'cancel_requested' && safe(payload.currentPeriodEnd))
    rows.push(`Erişim bitişi: ${safe(payload.currentPeriodEnd)}`)
  return rows
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function buildSubscriptionOperationEmail(
  data: SubscriptionOperationEmailData,
): SendEmailInput {
  const subject = LABELS[data.eventType] ?? 'Ogun aboneliğiniz güncellendi'
  const rows = details(data)
  const text = [
    subject,
    `Klinik: ${data.clinicName}`,
    ...rows,
    'Bu değişiklik Ogun operasyon ekibi tarafından gerçekleştirildi.',
  ].join('\n\n')
  return {
    to: data.recipientEmail,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#12211b"><h1 style="font-size:22px">${escapeHtml(subject)}</h1><p><strong>Klinik:</strong> ${escapeHtml(data.clinicName)}</p>${rows.map((row) => `<p>${escapeHtml(row)}</p>`).join('')}<p>Bu değişiklik Ogun operasyon ekibi tarafından gerçekleştirildi.</p></div>`,
  }
}
