import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { clinics, users } from './tenancy'

export const platformStaffRoleEnum = pgEnum('platform_staff_role', [
  'super_admin',
  'support',
  'clinical_ops',
  'food_editor',
  'billing_ops',
  'read_only',
])
export type PlatformStaffRole = (typeof platformStaffRoleEnum.enumValues)[number]

export const platformAuditOutcomeEnum = pgEnum('platform_audit_outcome', ['success', 'failure'])
export type PlatformAuditOutcome = (typeof platformAuditOutcomeEnum.enumValues)[number]

/** Canonical platform authorization record, deliberately separate from clinic_members. */
export const platformStaff = pgTable(
  'platform_staff',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: platformStaffRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: text('created_by').references(() => users.id),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex('platform_staff_user_id_idx').on(table.userId)],
)

/** Better Auth session model used only by apps/admin. */
export const adminSessions = pgTable('admin_sessions', {
  id: id(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps(),
})

/**
 * Better Auth 1.6.29 two-factor plugin schema. secret and backupCodes contain
 * values encrypted by Better Auth; callers must never return or log them.
 */
export const twoFactors = pgTable(
  'two_factors',
  {
    id: id(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [
    index('two_factors_secret_idx').on(table.secret),
    uniqueIndex('two_factors_user_id_idx').on(table.userId),
  ],
)

/** Append-only platform operations audit trail. No update/delete query is exported. */
export const platformAuditLogs = pgTable(
  'platform_audit_logs',
  {
    id: id(),
    actorUserId: text('actor_user_id').references(() => users.id),
    platformStaffId: text('platform_staff_id').references(() => platformStaff.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    clinicId: text('clinic_id').references(() => clinics.id),
    outcome: platformAuditOutcomeEnum('outcome').notNull(),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('platform_audit_logs_created_at_idx').on(table.createdAt.desc()),
    index('platform_audit_logs_actor_created_at_idx').on(table.actorUserId, table.createdAt.desc()),
    index('platform_audit_logs_action_created_at_idx').on(table.action, table.createdAt.desc()),
    index('platform_audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('platform_audit_logs_clinic_created_at_idx').on(table.clinicId, table.createdAt.desc()),
  ],
)
