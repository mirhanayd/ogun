import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Generic abuse buckets for custom (non-Better-Auth) endpoints. Only a SHA-256
// digest of namespace + identifier is stored; raw email/IP/session input is
// never persisted in a key or emitted to logs.
export const abuseRateLimits = pgTable('abuse_rate_limits', {
  keyHash: text('key_hash').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
