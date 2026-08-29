import { jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { clinics, users } from './tenancy'

/** Durable server-side receipts make desktop mutation retries idempotent. */
export const desktopMutationReceipts = pgTable(
  'desktop_mutation_receipts',
  {
    clinicId: text('clinic_id').notNull().references(() => clinics.id),
    userId: text('user_id').notNull().references(() => users.id),
    mutationId: text('mutation_id').notNull(),
    kind: text('kind').notNull(),
    result: jsonb('result').$type<{ idMap: Record<string, string> }>().notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.clinicId, table.userId, table.mutationId] })],
)
