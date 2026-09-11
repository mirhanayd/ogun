import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../client'
import { abuseRateLimits } from '../schema'
import { consumeAbuseRateLimit } from './security'

const describeWithDatabase = process.env.SECURITY_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDatabase('distributed abuse rate limiter', () => {
  let db: Database
  const keyHash = randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64)

  beforeAll(async () => {
    ;({ db } = await import('../client'))
  })

  afterAll(async () => {
    await db.delete(abuseRateLimits).where(eq(abuseRateLimits.keyHash, keyHash))
  })

  it('atomically admits only the configured number under concurrency and resets after expiry', async () => {
    const now = new Date('2026-09-11T12:00:00.000Z')
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeAbuseRateLimit(db, { keyHash, max: 5, windowSeconds: 60, now }),
      ),
    )

    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(5)
    await expect(
      consumeAbuseRateLimit(db, {
        keyHash,
        max: 5,
        windowSeconds: 60,
        now: new Date(now.getTime() + 60_001),
      }),
    ).resolves.toMatchObject({ allowed: true })
  })
})
