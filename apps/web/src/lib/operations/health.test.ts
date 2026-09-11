import { describe, expect, it } from 'vitest'
import { GET as live } from '@/app/api/health/live/route'
import { readinessResponse } from './health'

describe('health semantics', () => {
  it('keeps liveness independent from database state', async () => {
    expect(await (await live()).json()).toEqual({ status: 'ok' })
  })
  it('marks readiness unavailable when the database check fails', async () => {
    const response = await readinessResponse(async () => { throw new Error('db down') })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'not_ready' })
  })
})
