import { NextResponse, type NextRequest } from 'next/server'
import { areOperationalJobsEnabled, isCronRequestAuthorized } from '@/lib/operations/cron-auth'
import { HOBBY_DAILY_SYSTEM_JOBS, runOperationalJobBatch } from '@/lib/operations/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!areOperationalJobsEnabled()) {
    return NextResponse.json({ status: 'skipped', reason: 'jobs_disabled' }, { status: 503 })
  }

  const results = await runOperationalJobBatch(HOBBY_DAILY_SYSTEM_JOBS)
  const jobs = results.map(({ slug, execution }) => ({
    job: slug,
    status: execution.status,
    ...('runId' in execution ? { runId: execution.runId } : {}),
    ...('reason' in execution ? { reason: execution.reason } : {}),
  }))
  const failed = jobs.some((job) => job.status === 'failed')

  return NextResponse.json(
    { status: failed ? 'failed' : 'completed', jobs },
    { status: failed ? 503 : 200 },
  )
}
