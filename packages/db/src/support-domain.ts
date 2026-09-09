import type { SupportTicketStatus } from './schema/support'

export const SUPPORT_TICKET_TYPES = ['technical_issue', 'product_request', 'complaint', 'billing', 'other'] as const
export const SUPPORT_TICKET_AREAS = ['dashboard', 'clients', 'appointments', 'plan_editor', 'foods_recipes', 'measurements_devices', 'finance', 'team_permissions', 'appointment_reminders', 'plan_sharing', 'data_security', 'desktop_sync', 'subscription_billing', 'other'] as const
export const SUPPORT_REPORTED_IMPACTS = ['blocking', 'major', 'minor', 'suggestion'] as const
export const SUPPORT_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const
export const SUPPORT_STATUSES = ['submitted', 'triaged', 'in_progress', 'waiting_for_clinic', 'resolved', 'closed', 'reopened'] as const

export const SUPPORT_TYPE_LABELS: Record<(typeof SUPPORT_TICKET_TYPES)[number], string> = {
  technical_issue: 'Teknik sorun', product_request: 'Ürün / özellik önerisi', complaint: 'Şikayet', billing: 'Faturalandırma', other: 'Diğer',
}
export const SUPPORT_AREA_LABELS: Record<(typeof SUPPORT_TICKET_AREAS)[number], string> = {
  dashboard: 'Genel bakış', clients: 'Danışanlar', appointments: 'Randevular', plan_editor: 'Plan editörü', foods_recipes: 'Besinler ve tarifler', measurements_devices: 'Ölçümler ve cihazlar', finance: 'Finans', team_permissions: 'Ekip ve yetkiler', appointment_reminders: 'Randevu hatırlatmaları', plan_sharing: 'Plan paylaşımı', data_security: 'Veri güvenliği', desktop_sync: 'Masaüstü senkronizasyonu', subscription_billing: 'Abonelik ve faturalandırma', other: 'Diğer',
}
export const SUPPORT_IMPACT_LABELS: Record<(typeof SUPPORT_REPORTED_IMPACTS)[number], string> = {
  blocking: 'Çalışmamı tamamen engelliyor', major: 'Çalışmamı ciddi etkiliyor', minor: 'Küçük bir sorun', suggestion: 'Öneri / iyileştirme',
}
export const SUPPORT_PRIORITY_LABELS: Record<(typeof SUPPORT_PRIORITIES)[number], string> = {
  P1: 'P1 Kritik', P2: 'P2 Yüksek', P3: 'P3 Normal', P4: 'P4 Düşük',
}
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  submitted: 'Gönderildi', triaged: 'Değerlendirildi', in_progress: 'Üzerinde çalışılıyor', waiting_for_clinic: 'Sizden yanıt bekleniyor', resolved: 'Çözüldü', closed: 'Kapatıldı', reopened: 'Yeniden açıldı',
}

export const ADMIN_SUPPORT_TRANSITIONS: Readonly<Record<SupportTicketStatus, readonly SupportTicketStatus[]>> = {
  submitted: ['triaged', 'in_progress', 'waiting_for_clinic', 'resolved'],
  triaged: ['in_progress', 'waiting_for_clinic', 'resolved'],
  in_progress: ['waiting_for_clinic', 'resolved'],
  waiting_for_clinic: ['in_progress', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['triaged', 'in_progress', 'waiting_for_clinic', 'resolved'],
}

export function canAdminTransitionSupportTicket(from: SupportTicketStatus, to: SupportTicketStatus) {
  return ADMIN_SUPPORT_TRANSITIONS[from].includes(to)
}

export function canClinicReopenSupportTicket(status: SupportTicketStatus) {
  return status === 'resolved'
}
