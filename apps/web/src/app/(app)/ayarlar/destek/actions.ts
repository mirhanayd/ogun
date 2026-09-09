'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { addClinicSupportReply, createSupportTicketForClinic, reopenSupportTicketForClinic } from '@ogun/db/queries'
import { SUPPORT_REPORTED_IMPACTS, SUPPORT_TICKET_AREAS, SUPPORT_TICKET_TYPES } from '@ogun/db/support'
import type { SupportTicketArea, SupportTicketReportedImpact, SupportTicketType } from '@ogun/db/schema'
import { requireRole } from '@/lib/authz'
import { dispatchSupportNotification } from '@/lib/support-email'

const field = (data: FormData, name: string) => typeof data.get(name) === 'string' ? String(data.get(name)).trim() : ''
const messagePath = (path: string, key: 'mesaj' | 'hata' | 'mail', value: string) => { const url = new URL(path, 'http://local'); url.searchParams.set(key, value); return `${url.pathname}${url.search}` }

export async function createSupportTicketAction(formData: FormData) {
  const ctx = await requireRole('owner')
  try {
    const type = field(formData, 'type') as SupportTicketType
    const area = field(formData, 'area') as SupportTicketArea
    const reportedImpact = field(formData, 'reportedImpact') as SupportTicketReportedImpact
    if (!SUPPORT_TICKET_TYPES.includes(type) || !SUPPORT_TICKET_AREAS.includes(area) || !SUPPORT_REPORTED_IMPACTS.includes(reportedImpact)) throw new Error('Form seçimleri geçersiz.')
    const result = await createSupportTicketForClinic(db, { clinicId: ctx.scope.clinicId, requesterUserId: ctx.user.id, clientRequestId: field(formData, 'clientRequestId'), type, area, otherArea: field(formData, 'otherArea'), title: field(formData, 'title'), reportedImpact, body: field(formData, 'body') })
    const delivery = result.notificationId ? await dispatchSupportNotification(result.notificationId) : { status: 'not_sent' as const }
    revalidatePath('/ayarlar/destek')
    const base = `/ayarlar/destek/${encodeURIComponent(result.id)}`
    redirect(messagePath(base, delivery.status === 'failed' ? 'mail' : 'mesaj', delivery.status === 'failed' ? 'Bildirim e-postası şu anda gönderilemedi; talebiniz kaydedildi.' : `Talebiniz oluşturuldu: ${result.referenceCode}`))
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect(messagePath('/ayarlar/destek', 'hata', error instanceof Error ? error.message : 'Talep oluşturulamadı.'))
  }
}

export async function replySupportTicketAction(formData: FormData) {
  const ctx = await requireRole('owner')
  const ticketId = field(formData, 'ticketId')
  try {
    await addClinicSupportReply(db, { clinicId: ctx.scope.clinicId, userId: ctx.user.id, ticketId, clientRequestId: field(formData, 'clientRequestId'), body: field(formData, 'body') })
    revalidatePath(`/ayarlar/destek/${ticketId}`)
  } catch (error) {
    redirect(messagePath(`/ayarlar/destek/${encodeURIComponent(ticketId)}`, 'hata', error instanceof Error ? error.message : 'Yanıt eklenemedi.'))
  }
  redirect(messagePath(`/ayarlar/destek/${encodeURIComponent(ticketId)}`, 'mesaj', 'Yanıtınız eklendi.'))
}

export async function reopenSupportTicketAction(formData: FormData) {
  const ctx = await requireRole('owner')
  const ticketId = field(formData, 'ticketId')
  try {
    const result = await reopenSupportTicketForClinic(db, { clinicId: ctx.scope.clinicId, userId: ctx.user.id, ticketId })
    await dispatchSupportNotification(result.notificationId)
    revalidatePath(`/ayarlar/destek/${ticketId}`)
  } catch (error) {
    redirect(messagePath(`/ayarlar/destek/${encodeURIComponent(ticketId)}`, 'hata', error instanceof Error ? error.message : 'Talep yeniden açılamadı.'))
  }
  redirect(messagePath(`/ayarlar/destek/${encodeURIComponent(ticketId)}`, 'mesaj', 'Talep yeniden açıldı.'))
}
