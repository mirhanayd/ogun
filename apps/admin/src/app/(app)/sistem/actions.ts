'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { acknowledgeOperationalFinding, insertPlatformAuditLog, runSubscriptionReconciliationJob } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function runReconciliationAction() {
  const ctx = await requirePlatformPermission('system.manage')
  const request = await getPlatformRequestMetadata()
  const execution = await runSubscriptionReconciliationJob(db, 'manual')
  await insertPlatformAuditLog(db, {
    actorUserId: ctx.user.id, platformStaffId: ctx.staff.id,
    action: 'system.job.manual_run', entityType: 'operational_job_run', entityId: execution.runId,
    outcome: execution.status === 'failed' ? 'failure' : 'success', ...request,
    metadata: { jobName: 'subscription_reconciliation', status: execution.status },
  })
  revalidatePath('/sistem')
  redirect(`/sistem?mesaj=${encodeURIComponent(execution.status === 'skipped' ? 'İş zaten çalışıyor; ikinci çağrı atlandı.' : 'Abonelik kontrolü tamamlandı.')}`)
}

export async function acknowledgeFindingAction(formData: FormData) {
  const ctx = await requirePlatformPermission('system.manage')
  const findingId = field(formData, 'findingId')
  const request = await getPlatformRequestMetadata()
  const finding = await acknowledgeOperationalFinding(db, findingId)
  await insertPlatformAuditLog(db, {
    actorUserId: ctx.user.id, platformStaffId: ctx.staff.id,
    action: 'system.finding.acknowledged', entityType: 'operational_finding', entityId: findingId,
    outcome: finding ? 'success' : 'failure', reason: finding ? null : 'Finding is not open.', ...request,
  })
  revalidatePath('/sistem')
  redirect('/sistem')
}
