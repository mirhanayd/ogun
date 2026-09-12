import { sql } from 'drizzle-orm'
import { abuseRateLimits } from '../schema'
import type { Database } from '../client'

export interface AbuseRateLimitInput {
  keyHash: string
  max: number
  windowSeconds: number
  now?: Date
}

export async function consumeAbuseRateLimit(db: Database, input: AbuseRateLimitInput) {
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + input.windowSeconds * 1_000)
  // Raw SQL fragments do not pass through Drizzle's timestamp column encoder.
  // Bind ISO strings explicitly so every supported postgres-js/Drizzle version
  // sends a valid timestamptz value instead of a JavaScript Date object.
  const nowIso = now.toISOString()
  const expiresAtIso = expiresAt.toISOString()
  const [row] = await db
    .insert(abuseRateLimits)
    .values({ keyHash: input.keyHash, count: 1, windowStartedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: abuseRateLimits.keyHash,
      set: {
        count: sql<number>`case when ${abuseRateLimits.expiresAt} <= ${nowIso}::timestamptz then 1 else ${abuseRateLimits.count} + 1 end`,
        windowStartedAt: sql<Date>`case when ${abuseRateLimits.expiresAt} <= ${nowIso}::timestamptz then ${nowIso}::timestamptz else ${abuseRateLimits.windowStartedAt} end`,
        expiresAt: sql<Date>`case when ${abuseRateLimits.expiresAt} <= ${nowIso}::timestamptz then ${expiresAtIso}::timestamptz else ${abuseRateLimits.expiresAt} end`,
      },
    })
    .returning({ count: abuseRateLimits.count, expiresAt: abuseRateLimits.expiresAt })
  if (!row) throw new Error('Rate limit state could not be persisted.')
  return {
    allowed: row.count <= input.max,
    retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1_000)),
  }
}
