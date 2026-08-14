import { createId } from '@paralleldrive/cuid2'
import { text, timestamp } from 'drizzle-orm/pg-core'

export function id() {
  return text('id').primaryKey().$defaultFn(() => createId())
}

export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  }
}

export function softDelete() {
  return {
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  }
}
