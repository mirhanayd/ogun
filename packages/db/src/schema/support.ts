import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps } from './_helpers'
import { clinics, users } from './tenancy'
import { platformStaff } from './platform-admin'

export const supportTicketTypeEnum = pgEnum('support_ticket_type', ['technical_issue', 'product_request', 'complaint', 'billing', 'other'])
export const supportTicketAreaEnum = pgEnum('support_ticket_area', ['dashboard', 'clients', 'appointments', 'plan_editor', 'foods_recipes', 'measurements_devices', 'finance', 'team_permissions', 'appointment_reminders', 'plan_sharing', 'data_security', 'desktop_sync', 'subscription_billing', 'other'])
export const supportTicketStatusEnum = pgEnum('support_ticket_status', ['submitted', 'triaged', 'in_progress', 'waiting_for_clinic', 'resolved', 'closed', 'reopened'])
export const supportTicketReportedImpactEnum = pgEnum('support_ticket_reported_impact', ['blocking', 'major', 'minor', 'suggestion'])
export const supportTicketPriorityEnum = pgEnum('support_ticket_priority', ['P1', 'P2', 'P3', 'P4'])
export const supportMessageVisibilityEnum = pgEnum('support_message_visibility', ['public', 'internal'])
export const supportNotificationStatusEnum = pgEnum('support_notification_status', ['pending', 'sent', 'failed'])
export const supportNotificationTypeEnum = pgEnum('support_notification_type', ['ticket_created', 'public_reply', 'waiting_for_clinic', 'resolved', 'closed', 'reopened'])
export const supportEventTypeEnum = pgEnum('support_event_type', ['created', 'status_changed', 'priority_changed', 'assigned', 'unassigned', 'public_reply_added', 'internal_note_added', 'reopened'])

export type SupportTicketType = (typeof supportTicketTypeEnum.enumValues)[number]
export type SupportTicketArea = (typeof supportTicketAreaEnum.enumValues)[number]
export type SupportTicketStatus = (typeof supportTicketStatusEnum.enumValues)[number]
export type SupportTicketReportedImpact = (typeof supportTicketReportedImpactEnum.enumValues)[number]
export type SupportTicketPriority = (typeof supportTicketPriorityEnum.enumValues)[number]
export type SupportMessageVisibility = (typeof supportMessageVisibilityEnum.enumValues)[number]
export type SupportNotificationType = (typeof supportNotificationTypeEnum.enumValues)[number]

export const supportTickets = pgTable('support_tickets', {
  id: id(),
  referenceCode: text('reference_code').notNull(),
  clinicId: text('clinic_id').notNull().references(() => clinics.id),
  requesterUserId: text('requester_user_id').notNull().references(() => users.id),
  clientRequestId: text('client_request_id').notNull(),
  type: supportTicketTypeEnum('type').notNull(),
  area: supportTicketAreaEnum('area').notNull(),
  otherArea: text('other_area'),
  title: text('title').notNull(),
  reportedImpact: supportTicketReportedImpactEnum('reported_impact').notNull(),
  triagePriority: supportTicketPriorityEnum('triage_priority'),
  status: supportTicketStatusEnum('status').notNull().default('submitted'),
  assignedPlatformStaffId: text('assigned_platform_staff_id').references(() => platformStaff.id),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  triagedAt: timestamp('triaged_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  ...timestamps(),
}, (table) => [
  uniqueIndex('support_tickets_reference_code_idx').on(table.referenceCode),
  uniqueIndex('support_tickets_requester_client_request_idx').on(table.requesterUserId, table.clientRequestId),
  index('support_tickets_clinic_last_activity_idx').on(table.clinicId, table.lastActivityAt.desc()),
  index('support_tickets_status_priority_activity_idx').on(table.status, table.triagePriority, table.lastActivityAt.desc()),
  index('support_tickets_assigned_activity_idx').on(table.assignedPlatformStaffId, table.lastActivityAt.desc()),
  index('support_tickets_created_at_idx').on(table.createdAt.desc()),
  check('support_tickets_other_area_check', sql`${table.area} <> 'other' or length(trim(${table.otherArea})) between 2 and 80`),
])

export const supportTicketMessages = pgTable('support_ticket_messages', {
  id: id(),
  ticketId: text('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  clientRequestId: text('client_request_id').notNull(),
  authorUserId: text('author_user_id').references(() => users.id),
  authorPlatformStaffId: text('author_platform_staff_id').references(() => platformStaff.id),
  visibility: supportMessageVisibilityEnum('visibility').notNull(),
  body: text('body').notNull(),
  ...timestamps(),
}, (table) => [
  uniqueIndex('support_ticket_messages_request_idx').on(table.ticketId, table.clientRequestId),
  index('support_ticket_messages_ticket_created_idx').on(table.ticketId, table.createdAt),
  check('support_ticket_messages_exactly_one_author_check', sql`(${table.authorUserId} is not null)::int + (${table.authorPlatformStaffId} is not null)::int = 1`),
  check('support_ticket_messages_body_check', sql`length(trim(${table.body})) between 2 and 5000`),
])

export const supportTicketEvents = pgTable('support_ticket_events', {
  id: id(),
  ticketId: text('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  eventType: supportEventTypeEnum('event_type').notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),
  actorPlatformStaffId: text('actor_platform_staff_id').references(() => platformStaff.id),
  fromStatus: supportTicketStatusEnum('from_status'),
  toStatus: supportTicketStatusEnum('to_status'),
  fromPriority: supportTicketPriorityEnum('from_priority'),
  toPriority: supportTicketPriorityEnum('to_priority'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('support_ticket_events_ticket_created_idx').on(table.ticketId, table.createdAt),
  check('support_ticket_events_actor_check', sql`(${table.actorUserId} is not null)::int + (${table.actorPlatformStaffId} is not null)::int = 1`),
])

export const supportEmailNotifications = pgTable('support_email_notifications', {
  id: id(),
  ticketId: text('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  messageId: text('message_id').references(() => supportTicketMessages.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().references(() => supportTicketEvents.id, { onDelete: 'cascade' }),
  type: supportNotificationTypeEnum('type').notNull(),
  recipientUserId: text('recipient_user_id').notNull().references(() => users.id),
  recipientEmail: text('recipient_email').notNull(),
  status: supportNotificationStatusEnum('status').notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  ...timestamps(),
}, (table) => [
  uniqueIndex('support_email_notifications_event_idx').on(table.eventId),
  index('support_email_notifications_status_idx').on(table.status, table.createdAt),
  index('support_email_notifications_ticket_idx').on(table.ticketId, table.createdAt),
])
