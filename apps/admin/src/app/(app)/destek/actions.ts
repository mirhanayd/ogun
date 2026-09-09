'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { addPlatformSupportMessage, assignSupportTicketForPlatform, getActivePlatformStaffForAssignment, getSupportNotificationDelivery, getSupportTicketForPlatform, insertPlatformAuditLog, recordSupportNotificationRetryAudit, resolveSupportTicketForPlatform, setSupportTicketPriorityForPlatform, transitionSupportTicketForPlatform } from '@ogun/db/queries'
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from '@ogun/db/support'
import type { SupportMessageVisibility, SupportTicketPriority, SupportTicketStatus } from '@ogun/db/schema'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'
import { roleHasPermission } from '@/lib/platform-permissions'
import { dispatchSupportNotification } from '@/lib/support-email'

const field = (data: FormData, name: string) => typeof data.get(name) === 'string' ? String(data.get(name)).trim() : ''
const target = (ticketId: string, key: 'mesaj' | 'hata', value: string) => { const url = new URL(`/destek/${encodeURIComponent(ticketId)}`, 'http://local'); url.searchParams.set(key, value); return `${url.pathname}${url.search}` }
const actor = async (ctx: Awaited<ReturnType<typeof requirePlatformPermission>>) => ({ actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, ...await getPlatformRequestMetadata() })

async function failure(ctx: Awaited<ReturnType<typeof requirePlatformPermission>>, action: string, ticketId: string, reason: unknown) {
  const ticket = await getSupportTicketForPlatform(db, ticketId)
  await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action, entityType: 'support_ticket', entityId: ticketId || null, clinicId: ticket?.clinicId ?? null, outcome: 'failure', reason: reason instanceof Error ? reason.message : 'Bilinmeyen hata', ...await getPlatformRequestMetadata() })
}

export async function setTicketPriorityAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId')
  try { const priority = field(formData, 'priority') as SupportTicketPriority; if (!SUPPORT_PRIORITIES.includes(priority)) throw new Error('Geçersiz öncelik.'); await setSupportTicketPriorityForPlatform(db, { ...await actor(ctx), ticketId, priority }) }
  catch (error) { await failure(ctx, 'support.ticket.priority_changed', ticketId, error); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Öncelik güncellenemedi.')) }
  revalidatePath(`/destek/${ticketId}`); redirect(target(ticketId, 'mesaj', 'Öncelik güncellendi.'))
}

export async function transitionTicketAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId')
  try { const toStatus = field(formData, 'status') as SupportTicketStatus; if (!SUPPORT_STATUSES.includes(toStatus)) throw new Error('Geçersiz durum.'); const result = await transitionSupportTicketForPlatform(db, { ...await actor(ctx), ticketId, toStatus }); if (result.notificationId) await dispatchSupportNotification(result.notificationId) }
  catch (error) { await failure(ctx, 'support.ticket.status_changed', ticketId, error); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Durum güncellenemedi.')) }
  revalidatePath('/destek'); redirect(target(ticketId, 'mesaj', 'Durum güncellendi.'))
}

export async function assignTicketAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId'); const requested = field(formData, 'assignedPlatformStaffId'); const assignedPlatformStaffId = requested === 'self' ? ctx.staff.id : requested || null
  try {
    if (assignedPlatformStaffId) { const staff = await getActivePlatformStaffForAssignment(db, assignedPlatformStaffId); if (!staff || !roleHasPermission(staff.role, 'tickets.manage')) throw new Error('Bu personel destek taleplerini yönetemez.') }
    await assignSupportTicketForPlatform(db, { ...await actor(ctx), ticketId, assignedPlatformStaffId })
  } catch (error) { await failure(ctx, assignedPlatformStaffId ? 'support.ticket.assigned' : 'support.ticket.unassigned', ticketId, error); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Atama güncellenemedi.')) }
  revalidatePath(`/destek/${ticketId}`); redirect(target(ticketId, 'mesaj', assignedPlatformStaffId ? 'Talep atandı.' : 'Atama kaldırıldı.'))
}

export async function addTicketMessageAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId'); const visibility = field(formData, 'visibility') as SupportMessageVisibility
  try { if (visibility !== 'public' && visibility !== 'internal') throw new Error('Geçersiz mesaj görünürlüğü.'); const result = await addPlatformSupportMessage(db, { ...await actor(ctx), ticketId, visibility, body: field(formData, 'body'), clientRequestId: field(formData, 'clientRequestId') }); if (result.notificationId) await dispatchSupportNotification(result.notificationId) }
  catch (error) { await failure(ctx, visibility === 'internal' ? 'support.ticket.internal_note_added' : 'support.ticket.public_reply_added', ticketId, error); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Mesaj eklenemedi.')) }
  revalidatePath(`/destek/${ticketId}`); redirect(target(ticketId, 'mesaj', visibility === 'internal' ? 'İç not eklendi; e-posta gönderilmedi.' : 'Yanıt klinikle paylaşıldı.'))
}

export async function resolveTicketAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId')
  try { const result = await resolveSupportTicketForPlatform(db, { ...await actor(ctx), ticketId, body: field(formData, 'body'), clientRequestId: field(formData, 'clientRequestId') }); await dispatchSupportNotification(result.notificationId) }
  catch (error) { await failure(ctx, 'support.ticket.status_changed', ticketId, error); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Talep çözülemedi.')) }
  revalidatePath('/destek'); redirect(target(ticketId, 'mesaj', 'Çözüm klinikle paylaşıldı.'))
}

export async function retryNotificationAction(formData: FormData) {
  const ctx = await requirePlatformPermission('tickets.manage'); const ticketId = field(formData, 'ticketId'); const notificationId = field(formData, 'notificationId'); const request = await actor(ctx)
  try { const delivery = await getSupportNotificationDelivery(db, notificationId); const ticket = await getSupportTicketForPlatform(db, ticketId); if (!delivery || delivery.ticketId !== ticketId || !ticket) throw new Error('Bildirim bulunamadı.'); const result = await dispatchSupportNotification(notificationId, { retry: true }); if (result.status !== 'sent') throw new Error('Bildirim yeniden gönderilemedi veya daha önce gönderildi.'); await recordSupportNotificationRetryAudit(db, request, notificationId, ticketId, ticket.clinicId, 'success') }
  catch (error) { const ticket = await getSupportTicketForPlatform(db, ticketId); if (ticket) await recordSupportNotificationRetryAudit(db, request, notificationId, ticketId, ticket.clinicId, 'failure', error instanceof Error ? error.message : 'Gönderilemedi.'); redirect(target(ticketId, 'hata', error instanceof Error ? error.message : 'Bildirim yeniden gönderilemedi.')) }
  revalidatePath(`/destek/${ticketId}`); redirect(target(ticketId, 'mesaj', 'E-posta yeniden gönderildi.'))
}
