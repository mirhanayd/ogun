import 'server-only'
import { db, type Database } from '@ogun/db'
import {
  claimSubscriptionNotification,
  claimSupportNotification,
  getSubscriptionEmailNotification,
  getSupportNotificationDelivery,
  listDueSubscriptionNotificationIds,
  listDueSupportNotificationIds,
  markSubscriptionEmailFailed,
  markSubscriptionEmailSent,
  markSupportNotificationFailed,
  markSupportNotificationSent,
  withOperationalJobLock,
} from '@ogun/db/queries'
import { SUPPORT_STATUS_LABELS } from '@ogun/db/support'
import { buildSubscriptionOperationEmail, buildSupportTicketEmail, getEmailSender, type EmailSender } from '@ogun/email'

const DELIVERY_CONCURRENCY = 5
const DOMAIN_BATCH_SIZE = 50

async function deliverSupport(database: Database, sender: EmailSender, id: string, now: Date) {
  const claimed = await claimSupportNotification(database, id, false, now)
  if (!claimed) return 'skipped' as const
  const delivery = await getSupportNotificationDelivery(database, id)
  const webOrigin = process.env.OGUN_WEB_URL
  if (!delivery || !webOrigin) {
    await markSupportNotificationFailed(database, id, 'Delivery configuration unavailable.', claimed.claimToken, now)
    return 'failed' as const
  }
  try {
    const ticketUrl = new URL(`/ayarlar/destek/${encodeURIComponent(delivery.ticketId)}`, new URL(webOrigin).origin).toString()
    await sender.send(buildSupportTicketEmail({ ...delivery, statusLabel: SUPPORT_STATUS_LABELS[delivery.status], ticketUrl }))
    await markSupportNotificationSent(database, id, claimed.claimToken, now)
    return 'sent' as const
  } catch {
    await markSupportNotificationFailed(database, id, 'Email provider delivery failed.', claimed.claimToken, now)
    return 'failed' as const
  }
}

async function deliverSubscription(database: Database, sender: EmailSender, id: string, now: Date) {
  const claimed = await claimSubscriptionNotification(database, id, now)
  if (!claimed) return 'skipped' as const
  const delivery = await getSubscriptionEmailNotification(database, id)
  if (!delivery) {
    await markSubscriptionEmailFailed(database, id, 'Delivery record unavailable.', claimed.claimToken, now)
    return 'failed' as const
  }
  try {
    await sender.send(buildSubscriptionOperationEmail({
      recipientEmail: delivery.recipientEmail,
      clinicName: delivery.clinicName,
      eventType: delivery.eventType,
      payload: delivery.payload,
    }))
    await markSubscriptionEmailSent(database, id, claimed.claimToken, now)
    return 'sent' as const
  } catch {
    await markSubscriptionEmailFailed(database, id, 'Email provider delivery failed.', claimed.claimToken, now)
    return 'failed' as const
  }
}

export async function runEmailRetryOperationalJob(
  trigger: 'cron' | 'manual' | 'test',
  options: { now?: Date; database?: Database; sender?: EmailSender } = {},
) {
  const database = options.database ?? db
  const sender = options.sender ?? getEmailSender()
  const now = options.now ?? new Date()
  return withOperationalJobLock(database, { jobName: 'email_retry', trigger, now }, async () => {
    const [support, subscription] = await Promise.all([
      listDueSupportNotificationIds(database, now, DOMAIN_BATCH_SIZE),
      listDueSubscriptionNotificationIds(database, now, DOMAIN_BATCH_SIZE),
    ])
    const work = [
      ...support.map(({ id }) => () => deliverSupport(database, sender, id, now)),
      ...subscription.map(({ id }) => () => deliverSubscription(database, sender, id, now)),
    ]
    const results: Array<'sent' | 'failed' | 'skipped'> = []
    for (let offset = 0; offset < work.length; offset += DELIVERY_CONCURRENCY) {
      results.push(...await Promise.all(work.slice(offset, offset + DELIVERY_CONCURRENCY).map((task) => task())))
    }
    const sent = results.filter((result) => result === 'sent').length
    const failed = results.filter((result) => result === 'failed').length
    const skipped = results.filter((result) => result === 'skipped').length
    return {
      counts: { attempted: results.length, succeeded: sent, failed, skipped },
      metadata: { supportCandidates: support.length, subscriptionCandidates: subscription.length },
    }
  })
}
