import 'server-only'
import { db } from '@ogun/db'
import {
  claimSubscriptionNotification,
  getSubscriptionEmailNotification,
  markSubscriptionEmailFailed,
  markSubscriptionEmailSent,
} from '@ogun/db/queries'
import { buildSubscriptionOperationEmail, getEmailSender, type EmailSender } from '@ogun/email'

export async function dispatchSubscriptionNotification(
  notificationId: string,
  sender: EmailSender = getEmailSender(),
) {
  const claimed = await claimSubscriptionNotification(db, notificationId, new Date(), true)
  if (!claimed) return { status: 'not_sent' as const }
  const delivery = await getSubscriptionEmailNotification(db, notificationId)
  if (!delivery || delivery.status === 'sent') return { status: 'not_sent' as const }
  try {
    await sender.send(
      buildSubscriptionOperationEmail({
        recipientEmail: delivery.recipientEmail,
        clinicName: delivery.clinicName,
        eventType: delivery.eventType,
        payload: delivery.payload,
      }),
    )
    await markSubscriptionEmailSent(db, notificationId, claimed.claimToken)
    return { status: 'sent' as const }
  } catch (error) {
    await markSubscriptionEmailFailed(
      db,
      notificationId,
      error instanceof Error ? error.message : 'E-posta gönderilemedi.',
      claimed.claimToken,
    )
    return { status: 'failed' as const }
  }
}
