import { createId } from '@paralleldrive/cuid2'
import { detectSubscriptionDrift } from '@ogun/subscription-core'
import { and, count, desc, eq, gt, inArray, isNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm'
import type { Database } from '../client'
import {
  adminSessions,
  clinics,
  operationalFindings,
  operationalJobLeases,
  operationalJobRuns,
  providerWebhookReceipts,
  smsReminderDeliveries,
  subscriptionEmailNotifications,
  subscriptions,
  supportEmailNotifications,
  verifications,
  type OperationalFindingSeverity,
  type OperationalJobStatus,
  type OperationalJobTrigger,
} from '../schema'
import {
  OPERATIONAL_BATCH_SIZE,
  OPERATIONAL_JOB_LEASE_MS,
  OPERATIONAL_RUN_RETENTION_DAYS,
  type OperationalJobName,
} from '../operational-policy'

export interface OperationalJobCounts {
  attempted: number
  succeeded: number
  failed: number
  skipped: number
}

export interface OperationalJobResult {
  status?: Exclude<OperationalJobStatus, 'running' | 'skipped'>
  counts: OperationalJobCounts
  metadata?: Record<string, string | number | boolean | null>
}

export interface OperationalJobExecution {
  runId: string
  status: OperationalJobStatus
  reason?: 'already_running'
  result?: OperationalJobResult
}

const EMPTY_COUNTS: OperationalJobCounts = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 }

/**
 * Executes work under a short, expiring database lease. The lease is acquired
 * atomically and no SQL transaction is held while external providers run.
 */
export async function withOperationalJobLock(
  db: Database,
  input: {
    jobName: OperationalJobName
    trigger: OperationalJobTrigger
    now?: Date
    leaseMs?: number
    ownerToken?: string
  },
  work: (context: { runId: string; now: Date }) => Promise<OperationalJobResult>,
): Promise<OperationalJobExecution> {
  const now = input.now ?? new Date()
  const ownerToken = input.ownerToken ?? createId()
  const expiresAt = new Date(now.getTime() + (input.leaseMs ?? OPERATIONAL_JOB_LEASE_MS))
  const acquired = await db.execute(sql`
    insert into ${operationalJobLeases} (job_name, owner_token, acquired_at, expires_at, updated_at)
    values (${input.jobName}, ${ownerToken}, ${now.toISOString()}::timestamptz, ${expiresAt.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
    on conflict (job_name) do update set
      owner_token = excluded.owner_token,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    where ${operationalJobLeases.expiresAt} <= ${now.toISOString()}::timestamptz
    returning job_name
  `)

  if (acquired.length === 0) {
    const [run] = await db.insert(operationalJobRuns).values({
      jobName: input.jobName,
      trigger: input.trigger,
      status: 'skipped',
      startedAt: now,
      finishedAt: now,
      skippedCount: 1,
      metadata: { reason: 'already_running' },
    }).returning({ id: operationalJobRuns.id })
    if (!run) throw new Error('Operational job run could not be recorded.')
    return { runId: run.id, status: 'skipped', reason: 'already_running' }
  }

  const [run] = await db.insert(operationalJobRuns).values({
    jobName: input.jobName,
    trigger: input.trigger,
    status: 'running',
    startedAt: now,
  }).returning({ id: operationalJobRuns.id })
  if (!run) throw new Error('Operational job run could not be started.')

  const leaseMs = input.leaseMs ?? OPERATIONAL_JOB_LEASE_MS
  const heartbeat = setInterval(() => {
    const heartbeatAt = new Date()
    void db.update(operationalJobLeases).set({
      expiresAt: new Date(heartbeatAt.getTime() + leaseMs), updatedAt: heartbeatAt,
    }).where(and(eq(operationalJobLeases.jobName, input.jobName), eq(operationalJobLeases.ownerToken, ownerToken))).catch(() => undefined)
  }, Math.max(1_000, Math.floor(leaseMs / 3)))
  heartbeat.unref?.()
  try {
    const result = await work({ runId: run.id, now })
    const status = result.status ?? (result.counts.failed > 0 ? 'partial' : 'success')
    const finishedAt = new Date()
    await db.update(operationalJobRuns).set({
      status,
      finishedAt,
      attemptedCount: result.counts.attempted,
      succeededCount: result.counts.succeeded,
      failedCount: result.counts.failed,
      skippedCount: result.counts.skipped,
      metadata: result.metadata,
    }).where(eq(operationalJobRuns.id, run.id))
    return { runId: run.id, status, result }
  } catch {
    await db.update(operationalJobRuns).set({
      status: 'failed',
      finishedAt: new Date(),
      errorCode: 'job_execution_failed',
      errorSummary: 'Operational job execution failed.',
    }).where(eq(operationalJobRuns.id, run.id))
    return { runId: run.id, status: 'failed', result: { counts: EMPTY_COUNTS, status: 'failed' } }
  } finally {
    clearInterval(heartbeat)
    await db.delete(operationalJobLeases).where(and(
      eq(operationalJobLeases.jobName, input.jobName),
      eq(operationalJobLeases.ownerToken, ownerToken),
    ))
  }
}

export async function runSubscriptionReconciliationJob(
  db: Database,
  trigger: OperationalJobTrigger,
  options: { now?: Date; batchSize?: number } = {},
) {
  return withOperationalJobLock(db, { jobName: 'subscription_reconciliation', trigger, now: options.now }, async ({ now }) => {
    const rows = await db.select({
      clinicId: clinics.id,
      clinicStatus: clinics.subscriptionStatus,
      trialEndsAt: clinics.trialEndsAt,
      provider: subscriptions.provider,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    }).from(clinics).leftJoin(subscriptions, eq(subscriptions.clinicId, clinics.id))
      .orderBy(clinics.id).limit(options.batchSize ?? OPERATIONAL_BATCH_SIZE)

    const seen: string[] = []
    let warnings = 0
    let critical = 0
    for (const row of rows) {
      const drift = detectSubscriptionDrift({
        clinicStatus: row.clinicStatus,
        trialEndsAt: row.trialEndsAt,
        subscription: row.provider ? {
          provider: row.provider,
          providerSubscriptionId: row.providerSubscriptionId,
          cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
          currentPeriodEnd: row.currentPeriodEnd,
        } : null,
        now,
      })
      for (const item of drift) {
        const fingerprint = `subscription_drift:${row.clinicId}:${item.code}`
        seen.push(fingerprint)
        const severity: OperationalFindingSeverity = item.severity === 'error' ? 'critical' : 'warning'
        if (severity === 'critical') critical += 1
        else warnings += 1
        await db.insert(operationalFindings).values({
          kind: 'subscription_drift', severity, entityType: 'clinic', entityId: row.clinicId,
          clinicId: row.clinicId, fingerprint, status: 'open', firstSeenAt: now, lastSeenAt: now,
          summary: item.message, metadata: { reasonCode: item.code },
        }).onConflictDoUpdate({ target: operationalFindings.fingerprint, set: {
          severity, status: 'open', lastSeenAt: now, resolvedAt: null,
          summary: item.message, metadata: { reasonCode: item.code }, updatedAt: now,
        } })
      }
    }

    const checkedClinics = rows.map((row) => row.clinicId)
    if (checkedClinics.length > 0) {
      const unresolved = and(
        eq(operationalFindings.kind, 'subscription_drift'),
        inArray(operationalFindings.clinicId, checkedClinics),
        ne(operationalFindings.status, 'resolved'),
        seen.length ? notInArray(operationalFindings.fingerprint, seen) : undefined,
      )
      await db.update(operationalFindings).set({ status: 'resolved', resolvedAt: now, updatedAt: now }).where(unresolved)
    }
    return {
      status: critical > 0 || warnings > 0 ? 'partial' : 'success',
      counts: { attempted: rows.length, succeeded: rows.length, failed: 0, skipped: 0 },
      metadata: { checked: rows.length, warnings, critical, autoRepair: false },
    }
  })
}

export async function runMaintenanceJob(db: Database, trigger: OperationalJobTrigger, now = new Date()) {
  return withOperationalJobLock(db, { jobName: 'maintenance', trigger, now }, async () => {
    const retentionCutoff = new Date(now.getTime() - OPERATIONAL_RUN_RETENTION_DAYS * 86_400_000)
    const [expiredAdmin, expiredAuth, oldRuns] = await db.transaction(async (tx) => Promise.all([
      tx.delete(adminSessions).where(lte(adminSessions.expiresAt, now)).returning({ id: adminSessions.id }),
      tx.delete(verifications).where(lte(verifications.expiresAt, now)).returning({ id: verifications.id }),
      tx.delete(operationalJobRuns).where(and(lt(operationalJobRuns.startedAt, retentionCutoff), inArray(operationalJobRuns.status, ['success', 'skipped']))).returning({ id: operationalJobRuns.id }),
    ]))
    const total = expiredAdmin.length + expiredAuth.length + oldRuns.length
    return { counts: { attempted: total, succeeded: total, failed: 0, skipped: 0 }, metadata: {
      expiredAdminSessions: expiredAdmin.length,
      expiredAuthVerifications: expiredAuth.length,
      completedRunTelemetry: oldRuns.length,
      retentionDays: OPERATIONAL_RUN_RETENTION_DAYS,
    } }
  })
}

export async function acknowledgeOperationalFinding(db: Database, findingId: string, now = new Date()) {
  const [row] = await db.update(operationalFindings).set({ status: 'acknowledged', acknowledgedAt: now, updatedAt: now })
    .where(and(eq(operationalFindings.id, findingId), eq(operationalFindings.status, 'open')))
    .returning({ id: operationalFindings.id })
  return row ?? null
}

export async function getSystemOperationsSummary(db: Database, now = new Date()) {
  const [
    runs,
    findings,
    [supportPending],
    [subscriptionPending],
    [supportTerminal],
    [subscriptionTerminal],
    [pendingSms],
    [processingSms],
    [retryableSms],
    [terminalSms],
    [unknownSms],
    [webhookProcessing],
    [webhookFailed],
    [webhookDuplicates],
    [activeJobLeases],
    [runningJobs],
    [lastWebhook],
  ] = await Promise.all([
    db.select().from(operationalJobRuns).orderBy(desc(operationalJobRuns.startedAt)).limit(50),
    db.select().from(operationalFindings).where(or(eq(operationalFindings.status, 'open'), eq(operationalFindings.status, 'acknowledged'))).orderBy(desc(operationalFindings.lastSeenAt)).limit(50),
    db.select({ value: count() }).from(supportEmailNotifications).where(and(ne(supportEmailNotifications.status, 'sent'), isNull(supportEmailNotifications.terminalAt))),
    db.select({ value: count() }).from(subscriptionEmailNotifications).where(and(ne(subscriptionEmailNotifications.status, 'sent'), isNull(subscriptionEmailNotifications.terminalAt))),
    db.select({ value: count() }).from(supportEmailNotifications).where(sql`${supportEmailNotifications.terminalAt} is not null`),
    db.select({ value: count() }).from(subscriptionEmailNotifications).where(sql`${subscriptionEmailNotifications.terminalAt} is not null`),
    db.select({ value: count() }).from(smsReminderDeliveries).where(eq(smsReminderDeliveries.status, 'pending')),
    db.select({ value: count() }).from(smsReminderDeliveries).where(eq(smsReminderDeliveries.status, 'processing')),
    db.select({ value: count() }).from(smsReminderDeliveries).where(eq(smsReminderDeliveries.status, 'failed_retryable')),
    db.select({ value: count() }).from(smsReminderDeliveries).where(eq(smsReminderDeliveries.status, 'failed_terminal')),
    db.select({ value: count() }).from(smsReminderDeliveries).where(eq(smsReminderDeliveries.status, 'unknown')),
    db.select({ value: count() }).from(providerWebhookReceipts).where(eq(providerWebhookReceipts.status, 'processing')),
    db.select({ value: count() }).from(providerWebhookReceipts).where(eq(providerWebhookReceipts.status, 'failed')),
    db.select({ value: sql<number>`greatest(coalesce(sum(${providerWebhookReceipts.attemptCount}) - count(*), 0)::int, 0)` }).from(providerWebhookReceipts),
    db.select({ value: count() }).from(operationalJobLeases).where(gt(operationalJobLeases.expiresAt, now)),
    db.select({ value: count() }).from(operationalJobRuns).where(eq(operationalJobRuns.status, 'running')),
    db.select({ receivedAt: providerWebhookReceipts.receivedAt, status: providerWebhookReceipts.status }).from(providerWebhookReceipts).orderBy(desc(providerWebhookReceipts.receivedAt)).limit(1),
  ])
  const latestRuns = [...new Map(runs.map((run) => [run.jobName, run])).values()]
  return {
    latestRuns,
    recentRuns: runs,
    findings,
    counts: {
      pendingEmail: (supportPending?.value ?? 0) + (subscriptionPending?.value ?? 0),
      terminalEmail: (supportTerminal?.value ?? 0) + (subscriptionTerminal?.value ?? 0),
      supportPendingEmail: supportPending?.value ?? 0,
      subscriptionPendingEmail: subscriptionPending?.value ?? 0,
      supportTerminalEmail: supportTerminal?.value ?? 0,
      subscriptionTerminalEmail: subscriptionTerminal?.value ?? 0,
      pendingSms: pendingSms?.value ?? 0,
      processingSms: processingSms?.value ?? 0,
      retryableSms: retryableSms?.value ?? 0,
      terminalSms: terminalSms?.value ?? 0,
      unknownSms: unknownSms?.value ?? 0,
      processingWebhooks: webhookProcessing?.value ?? 0,
      failedWebhooks: webhookFailed?.value ?? 0,
      openWarnings: findings.filter((item) => item.severity === 'warning').length,
      openCritical: findings.filter((item) => item.severity === 'critical').length,
      duplicateWebhooks: webhookDuplicates?.value ?? 0,
      activeJobLeases: activeJobLeases?.value ?? 0,
      runningJobs: runningJobs?.value ?? 0,
    },
    lastWebhook: lastWebhook ?? null,
  }
}

export async function getOperationalJobRun(db: Database, runId: string) {
  const [run] = await db.select().from(operationalJobRuns).where(eq(operationalJobRuns.id, runId)).limit(1)
  return run ?? null
}

export async function checkDatabaseConnection(db: Database) {
  await db.execute(sql`select 1`)
  return true
}
