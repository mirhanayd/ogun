import 'server-only'
import { db } from '@ogun/db'
import { runMaintenanceJob, runSubscriptionReconciliationJob } from '@ogun/db/queries'
import { logger } from '@/lib/monitoring/logger'
import { runSmsReminderOperationalJob } from '@/lib/sms/reminder-runner'
import { runEmailRetryOperationalJob } from './email-retry'
import { externalDeliveryAllowed } from './cron-auth'

export const CRON_JOB_SLUGS = ['sms-reminders', 'email-retry', 'subscription-reconciliation', 'maintenance'] as const
export type CronJobSlug = (typeof CRON_JOB_SLUGS)[number]

export async function runOperationalJobBySlug(slug: CronJobSlug, trigger: 'cron' | 'manual' | 'test' = 'cron') {
  const startedAt = Date.now()
  let execution
  if (slug === 'sms-reminders') {
    if (!externalDeliveryAllowed()) return { status: 'skipped' as const, reason: 'external_delivery_disabled' as const }
    execution = await runSmsReminderOperationalJob(trigger)
  } else if (slug === 'email-retry') {
    if (!externalDeliveryAllowed()) return { status: 'skipped' as const, reason: 'external_delivery_disabled' as const }
    execution = await runEmailRetryOperationalJob(trigger)
  } else if (slug === 'subscription-reconciliation') {
    execution = await runSubscriptionReconciliationJob(db, trigger)
  } else {
    execution = await runMaintenanceJob(db, trigger)
  }
  logger.info({
    jobName: slug,
    runId: execution.runId,
    status: execution.status,
    durationMs: Date.now() - startedAt,
    counts: execution.result?.counts,
  }, 'Operational job completed')
  return execution
}
