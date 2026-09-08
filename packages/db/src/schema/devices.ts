import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_helpers'
import { platformStaff } from './platform-admin'
import { sessions, users } from './tenancy'

export const deviceStatusEnum = pgEnum('device_status', ['active', 'revoked'])
export type DeviceStatus = (typeof deviceStatusEnum.enumValues)[number]

/**
 * A device is an Ogun installation, not a hardware identity or credential.
 * Only the SHA-256 hash of the random, Stronghold-backed installation ID is stored.
 */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    installationIdHash: text('installation_id_hash').notNull(),
    platform: text('platform').notNull(),
    displayName: text('display_name').notNull(),
    appVersion: text('app_version').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastIpAddress: text('last_ip_address'),
    status: deviceStatusEnum('status').notNull().default('active'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByPlatformStaffId: text('revoked_by_platform_staff_id').references(() => platformStaff.id),
    revokedReason: text('revoked_reason'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('devices_installation_id_hash_idx').on(table.installationIdHash),
    index('devices_status_idx').on(table.status),
    index('devices_last_seen_at_idx').on(table.lastSeenAt.desc()),
  ],
)

export const deviceUserLinks = pgTable(
  'device_user_links',
  {
    id: id(),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('device_user_links_device_user_idx').on(table.deviceId, table.userId),
    index('device_user_links_user_id_idx').on(table.userId),
  ],
)

/** Links an installation only to canonical web/desktop sessions, never admin_sessions. */
export const deviceSessions = pgTable(
  'device_sessions',
  {
    id: id(),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('device_sessions_device_id_idx').on(table.deviceId),
    uniqueIndex('device_sessions_session_id_idx').on(table.sessionId),
  ],
)
