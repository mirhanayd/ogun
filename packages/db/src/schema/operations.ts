import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { appointments } from './appointments'
import { clients } from './clients'
import { clinics } from './tenancy'
import { id, timestamps } from './_helpers'

export const operationalJobTriggerEnum = pgEnum('operational_job_trigger', ['cron', 'manual', 'test'])
export const operationalJobStatusEnum = pgEnum('operational_job_status', [
  'running',
  'success',
  'partial',
  'failed',
  'skipped',
])
export const operationalFindingSeverityEnum = pgEnum('operational_finding_severity', [
  'info',
  'warning',
  'critical',
])
export const operationalFindingStatusEnum = pgEnum('operational_finding_status', [
  'open',
  'acknowledged',
  'resolved',
])
export const smsReminderDeliveryStatusEnum = pgEnum('sms_reminder_delivery_status', [
  'pending',
  'processing',
  'sent',
  'failed_retryable',
  'failed_terminal',
  'skipped_no_consent',
  'cancelled',
  'unknown',
])
export const providerWebhookReceiptStatusEnum = pgEnum('provider_webhook_receipt_status', [
  'processing',
  'processed',
  'failed',
])

export type OperationalJobTrigger = (typeof operationalJobTriggerEnum.enumValues)[number]
export type OperationalJobStatus = (typeof operationalJobStatusEnum.enumValues)[number]
export type OperationalFindingSeverity = (typeof operationalFindingSeverityEnum.enumValues)[number]
export type SmsReminderDeliveryStatus = (typeof smsReminderDeliveryStatusEnum.enumValues)[number]

/** A database lease, rather than an in-process mutex, keeps serverless instances coordinated. */
export const operationalJobLeases = pgTable('operational_job_leases', {
  jobName: text('job_name').primaryKey(),
  ownerToken: text('owner_token').notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const operationalJobRuns = pgTable(
  'operational_job_runs',
  {
    id: id(),
    jobName: text('job_name').notNull(),
    trigger: operationalJobTriggerEnum('trigger').notNull(),
    status: operationalJobStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attemptedCount: integer('attempted_count').notNull().default(0),
    succeededCount: integer('succeeded_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('operational_job_runs_job_started_idx').on(table.jobName, table.startedAt.desc()),
    index('operational_job_runs_status_started_idx').on(table.status, table.startedAt.desc()),
  ],
)

export const operationalFindings = pgTable(
  'operational_findings',
  {
    id: id(),
    kind: text('kind').notNull(),
    severity: operationalFindingSeverityEnum('severity').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    clinicId: text('clinic_id').references(() => clinics.id),
    fingerprint: text('fingerprint').notNull(),
    status: operationalFindingStatusEnum('status').notNull().default('open'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('operational_findings_fingerprint_idx').on(table.fingerprint),
    index('operational_findings_status_severity_idx').on(table.status, table.severity, table.lastSeenAt.desc()),
    index('operational_findings_clinic_idx').on(table.clinicId, table.lastSeenAt.desc()),
  ],
)

export const smsReminderDeliveries = pgTable(
  'sms_reminder_deliveries',
  {
    id: id(),
    clinicId: text('clinic_id').notNull().references(() => clinics.id),
    appointmentId: text('appointment_id').notNull().references(() => appointments.id),
    clientId: text('client_id').notNull().references(() => clients.id),
    reminderType: text('reminder_type').notNull().default('appointment_24h'),
    status: smsReminderDeliveryStatusEnum('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    provider: text('provider'),
    providerMessageId: text('provider_message_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorSummary: text('last_error_summary'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('sms_reminder_deliveries_identity_idx').on(table.appointmentId, table.reminderType),
    index('sms_reminder_deliveries_due_idx').on(table.status, table.nextAttemptAt),
    index('sms_reminder_deliveries_clinic_idx').on(table.clinicId, table.createdAt.desc()),
  ],
)

export const providerWebhookReceipts = pgTable(
  'provider_webhook_receipts',
  {
    id: id(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadHash: text('payload_hash').notNull(),
    providerOccurredAt: timestamp('provider_occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    status: providerWebhookReceiptStatusEnum('status').notNull().default('processing'),
    attemptCount: integer('attempt_count').notNull().default(1),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    uniqueIndex('provider_webhook_receipts_provider_event_idx').on(table.provider, table.providerEventId),
    index('provider_webhook_receipts_status_received_idx').on(table.status, table.receivedAt.desc()),
  ],
)
