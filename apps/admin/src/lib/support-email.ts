import 'server-only'
import { db } from '@ogun/db'
import { claimSupportNotification, getSupportNotificationDelivery, markSupportNotificationFailed, markSupportNotificationSent } from '@ogun/db/queries'
import { SUPPORT_STATUS_LABELS } from '@ogun/db/support'
import { buildSupportTicketEmail, getEmailSender, type EmailSender } from '@ogun/email'

export async function dispatchSupportNotification(notificationId: string, options: { retry?: boolean; sender?: EmailSender } = {}) {
  const claimed = await claimSupportNotification(db, notificationId, options.retry ?? false)
  if (!claimed) return { status: 'not_sent' as const }
  const delivery = await getSupportNotificationDelivery(db, notificationId)
  if (!delivery) throw new Error('Bildirim kaydı bulunamadı.')
  const webOrigin = process.env.OGUN_WEB_URL
  if (!webOrigin) {
    await markSupportNotificationFailed(db, notificationId, 'OGUN_WEB_URL tanımlı değil.')
    return { status: 'failed' as const }
  }
  try {
    const origin = new URL(webOrigin).origin
    const ticketUrl = new URL(`/ayarlar/destek/${encodeURIComponent(delivery.ticketId)}`, origin).toString()
    await (options.sender ?? getEmailSender()).send(buildSupportTicketEmail({ ...delivery, statusLabel: SUPPORT_STATUS_LABELS[delivery.status], ticketUrl }))
    await markSupportNotificationSent(db, notificationId)
    return { status: 'sent' as const }
  } catch (error) {
    await markSupportNotificationFailed(db, notificationId, error instanceof Error ? error.message : 'E-posta gönderilemedi.')
    return { status: 'failed' as const }
  }
}
