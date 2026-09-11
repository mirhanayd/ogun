import { NextResponse, type NextRequest } from 'next/server'
import { areOperationalJobsEnabled, isCronRequestAuthorized } from '@/lib/operations/cron-auth'
import { CRON_JOB_SLUGS, runOperationalJobBySlug, type CronJobSlug } from '@/lib/operations/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: { params: Promise<{ job: string }> }) {
  if (!isCronRequestAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!areOperationalJobsEnabled()) {
    return NextResponse.json({ status: 'skipped', reason: 'jobs_disabled' }, { status: 503 })
  }
  const { job } = await context.params
  if (!CRON_JOB_SLUGS.includes(job as CronJobSlug)) {
    return NextResponse.json({ error: 'job_not_found' }, { status: 404 })
  }
  const execution = await runOperationalJobBySlug(job as CronJobSlug)
  return NextResponse.json({
    status: execution.status,
    ...('runId' in execution ? { runId: execution.runId } : {}),
    ...('reason' in execution ? { reason: execution.reason } : {}),
  }, { status: execution.status === 'failed' ? 503 : 200 })
}
