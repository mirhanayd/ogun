import 'server-only'
import { db } from '@ogun/db'
import {
  getSubscriptionEmailNotification,
  markSubscriptionEmailFailed,
  markSubscriptionEmailSent,
} from '@ogun/db/queries'
import { buildSubscriptionOperationEmail, getEmailSender, type EmailSender } from '@ogun/email'

export async function dispatchSubscriptionNotification(
  notificationId: string,
  sender: EmailSender = getEmailSender(),
) {
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
    await markSubscriptionEmailSent(db, notificationId)
    return { status: 'sent' as const }
  } catch (error) {
    await markSubscriptionEmailFailed(
      db,
      notificationId,
      error instanceof Error ? error.message : 'E-posta gönderilemedi.',
    )
    return { status: 'failed' as const }
  }
}
