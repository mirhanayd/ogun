// SMS sorguları — GitHub issue #41 / Prompt 7.3, GÖREV 3. clients.ts/
// appointments.ts üstündeki notla AYNI desen: clinicId düz bir string.
import { and, count, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { appointments, type AppointmentStatus } from '../schema/appointments'
import { clients } from '../schema/clients'
import { smsLogs, type SmsLogStatus } from '../schema/sms'
import { clinics, smsReminderDeliveries } from '../schema'
import type { Database } from '../client'
import { DELIVERY_CLAIM_MS, SMS_MAX_ATTEMPTS, nextRetryAt } from '../operational-policy'

export interface InsertSmsLogInput {
  clientId: string
  appointmentId?: string | null
  phone: string
  message: string
  status: SmsLogStatus
  provider: string
  errorMessage?: string | null
  sentAt?: Date
  reminderDeliveryId?: string | null
}

export async function insertSmsLog(db: Database, clinicId: string, input: InsertSmsLogInput) {
  const [row] = await db
    .insert(smsLogs)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('SMS kaydı yazılamadı.')
  return row
}

// Kota takibi (GÖREV 3) — schema/sms.ts dosya başı notundaki gibi, ayrı bir
// sayaç sütunu değil, BAŞARIYLA gönderilmiş ('gönderildi') satırların
// SAYISI. `since` — abonelik döneminin başlangıcı (bkz.
// apps/web/src/lib/subscription/limits.ts).
export async function countSentSmsInPeriod(db: Database, clinicId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(smsLogs)
    .where(and(eq(smsLogs.clinicId, clinicId), eq(smsLogs.status, 'gönderildi'), gte(smsLogs.sentAt, since)))
  return row?.total ?? 0
}

export async function listSmsLogsForClinic(db: Database, clinicId: string, limit = 50) {
  return db
    .select()
    .from(smsLogs)
    .where(eq(smsLogs.clinicId, clinicId))
    .orderBy(smsLogs.sentAt)
    .limit(limit)
}

// Dedupe kontrolü (GÖREV 3, "24 saat önce OTOMATİK SMS" — aynı randevu için
// birden fazla hatırlatma gitmemeli). appointmentId NULL olan (randevu dışı)
// SMS'ler bu kontrolün kapsamı DIŞINDA.
export async function getSmsLogForAppointment(db: Database, clinicId: string, appointmentId: string) {
  const [row] = await db
    .select({ id: smsLogs.id })
    .from(smsLogs)
    .where(and(eq(smsLogs.clinicId, clinicId), eq(smsLogs.appointmentId, appointmentId)))
    .limit(1)
  return row ?? null
}

// --- Hatırlatma adayları -----------------------------------------------------

export interface ReminderCandidateRow {
  appointmentId: string
  startsAt: Date
  status: AppointmentStatus
  clientId: string
  clientFirstName: string
  clientLastName: string
  clientPhone: string | null
  clientSmsConsentAt: Date | null
}

// apps/web/src/lib/sms/reminder-eligibility.ts decideReminderForAppointment'ın
// girdisi — pencere/rıza/dedupe KARARI burada DEĞİL orada verilir (bkz. o
// dosyanın dosya başı notu), bu sorgu SADECE "24 saat içinde başlayacak,
// henüz iptal/gerçekleşmemiş" adayları ham veriyle getirir. `until` çağıran
// tarafından verilir (reminder-runner.ts, now + 24s + pencere payı).
export async function listAppointmentReminderCandidates(
  db: Database,
  clinicId: string,
  now: Date,
  until: Date,
): Promise<ReminderCandidateRow[]> {
  return db
    .select({
      appointmentId: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      clientId: clients.id,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      clientPhone: clients.phone,
      clientSmsConsentAt: clients.smsConsentAt,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        inArray(appointments.status, ['planlandı', 'ertelendi']),
        gte(appointments.startsAt, now),
        lte(appointments.startsAt, until),
      ),
    )
}

export async function listSmsReminderClinicIds(db: Database, now: Date, until: Date, limit = 100) {
  return db.selectDistinct({ clinicId: clinics.id })
    .from(clinics)
    .innerJoin(appointments, eq(appointments.clinicId, clinics.id))
    .where(and(
      isNotNull(clinics.onboardingCompletedAt),
      or(eq(clinics.subscriptionStatus, 'active'), and(eq(clinics.subscriptionStatus, 'trialing'), or(isNotNull(clinics.trialEndsAt), sql`${clinics.trialEndsAt} is null`))),
      or(sql`${clinics.trialEndsAt} is null`, gte(clinics.trialEndsAt, now), eq(clinics.subscriptionStatus, 'active')),
      inArray(appointments.status, ['planlandı', 'ertelendi']),
      gte(appointments.startsAt, now),
      lte(appointments.startsAt, until),
    ))
    .orderBy(clinics.id)
    .limit(limit)
}

export async function getAppointmentReminderState(db: Database, clinicId: string, appointmentId: string) {
  const [row] = await db.select({
    appointmentId: appointments.id,
    clinicId: appointments.clinicId,
    startsAt: appointments.startsAt,
    status: appointments.status,
    clientId: clients.id,
    clientFirstName: clients.firstName,
    clientLastName: clients.lastName,
    clientPhone: clients.phone,
    clientSmsConsentAt: clients.smsConsentAt,
  }).from(appointments).innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId))).limit(1)
  return row ?? null
}

/**
 * Claims before provider send. A stale processing claim becomes `unknown`,
 * never retryable: without provider lookup/idempotency a crash may have sent.
 */
export async function claimSmsReminderDelivery(
  db: Database,
  input: { clinicId: string; appointmentId: string; clientId: string; now?: Date; reminderType?: string },
) {
  const now = input.now ?? new Date()
  const reminderType = input.reminderType ?? 'appointment_24h'
  await db.update(smsReminderDeliveries).set({
    status: 'unknown', claimExpiresAt: null, lastErrorCode: 'claim_expired',
    lastErrorSummary: 'Provider outcome requires manual review.', updatedAt: now,
  }).where(and(
    eq(smsReminderDeliveries.appointmentId, input.appointmentId),
    eq(smsReminderDeliveries.reminderType, reminderType),
    eq(smsReminderDeliveries.status, 'processing'),
    lte(smsReminderDeliveries.claimExpiresAt, now),
  ))

  const claimExpiresAt = new Date(now.getTime() + DELIVERY_CLAIM_MS)
  const [created] = await db.insert(smsReminderDeliveries).values({
    clinicId: input.clinicId,
    appointmentId: input.appointmentId,
    clientId: input.clientId,
    reminderType,
    status: 'processing',
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt,
    nextAttemptAt: now,
    lastAttemptAt: now,
  }).onConflictDoNothing({ target: [smsReminderDeliveries.appointmentId, smsReminderDeliveries.reminderType] }).returning()
  if (created) return created

  const [retried] = await db.update(smsReminderDeliveries).set({
    status: 'processing', claimedAt: now, claimExpiresAt, lastAttemptAt: now,
    attemptCount: sql`${smsReminderDeliveries.attemptCount} + 1`,
    lastErrorCode: null, lastErrorSummary: null, updatedAt: now,
  }).where(and(
    eq(smsReminderDeliveries.appointmentId, input.appointmentId),
    eq(smsReminderDeliveries.reminderType, reminderType),
    eq(smsReminderDeliveries.status, 'failed_retryable'),
    lte(smsReminderDeliveries.nextAttemptAt, now),
    sql`${smsReminderDeliveries.attemptCount} < ${SMS_MAX_ATTEMPTS}`,
  )).returning()
  return retried ?? null
}

export async function recordSmsReminderNoConsent(
  db: Database,
  input: { clinicId: string; appointmentId: string; clientId: string; phone: string; provider: string; now?: Date },
) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [delivery] = await tx.insert(smsReminderDeliveries).values({
      clinicId: input.clinicId, appointmentId: input.appointmentId, clientId: input.clientId,
      status: 'skipped_no_consent', nextAttemptAt: now,
    }).onConflictDoNothing({ target: [smsReminderDeliveries.appointmentId, smsReminderDeliveries.reminderType] }).returning()
    if (!delivery) return null
    await tx.insert(smsLogs).values({
      clinicId: input.clinicId, clientId: input.clientId, appointmentId: input.appointmentId,
      reminderDeliveryId: delivery.id, phone: input.phone, message: '', status: 'rıza_yok',
      provider: input.provider, errorMessage: 'Danışanın SMS rızası yok.', sentAt: now,
    })
    return delivery
  })
}

export async function cancelSmsReminderDelivery(db: Database, deliveryId: string, now = new Date()) {
  await db.update(smsReminderDeliveries).set({ status: 'cancelled', claimExpiresAt: null, updatedAt: now })
    .where(and(eq(smsReminderDeliveries.id, deliveryId), eq(smsReminderDeliveries.status, 'processing')))
}

export async function markSmsReminderSent(db: Database, input: {
  deliveryId: string; clinicId: string; clientId: string; appointmentId: string
  phone: string; message: string; provider: string; providerMessageId?: string | null; now?: Date
}) {
  const now = input.now ?? new Date()
  return db.transaction(async (tx) => {
    const [delivery] = await tx.update(smsReminderDeliveries).set({
      status: 'sent', sentAt: now, provider: input.provider,
      providerMessageId: input.providerMessageId ?? null, claimExpiresAt: null,
      lastErrorCode: null, lastErrorSummary: null, updatedAt: now,
    }).where(and(eq(smsReminderDeliveries.id, input.deliveryId), eq(smsReminderDeliveries.status, 'processing')))
      .returning({ id: smsReminderDeliveries.id })
    if (!delivery) return null
    await tx.insert(smsLogs).values({
      clinicId: input.clinicId, clientId: input.clientId, appointmentId: input.appointmentId,
      reminderDeliveryId: input.deliveryId, phone: input.phone, message: input.message,
      status: 'gönderildi', provider: input.provider, sentAt: now,
    }).onConflictDoNothing({ target: smsLogs.reminderDeliveryId })
    return delivery
  })
}

export async function markSmsReminderFailed(db: Database, input: {
  deliveryId: string; retryable: boolean; errorCode: string; appointmentStartsAt: Date; now?: Date
}) {
  const now = input.now ?? new Date()
  const [current] = await db.select({ attemptCount: smsReminderDeliveries.attemptCount })
    .from(smsReminderDeliveries).where(and(eq(smsReminderDeliveries.id, input.deliveryId), eq(smsReminderDeliveries.status, 'processing'))).limit(1)
  if (!current) return null
  const nextAttemptAt = nextRetryAt(now, current.attemptCount, 'sms')
  const retryable = input.retryable && current.attemptCount < SMS_MAX_ATTEMPTS && nextAttemptAt < input.appointmentStartsAt
  const [row] = await db.update(smsReminderDeliveries).set({
    status: retryable ? 'failed_retryable' : 'failed_terminal',
    nextAttemptAt, claimExpiresAt: null, lastErrorCode: input.errorCode,
    lastErrorSummary: retryable ? 'Provider delivery failed; retry scheduled.' : 'Provider delivery failed permanently.',
    updatedAt: now,
  }).where(and(eq(smsReminderDeliveries.id, input.deliveryId), eq(smsReminderDeliveries.status, 'processing'))).returning()
  return row ?? null
}

export async function markSmsReminderUnknown(db: Database, deliveryId: string, now = new Date()) {
  const [row] = await db.update(smsReminderDeliveries).set({
    status: 'unknown', claimExpiresAt: null, lastErrorCode: 'finalize_unavailable',
    lastErrorSummary: 'Provider accepted the request; final state requires manual review.', updatedAt: now,
  }).where(and(eq(smsReminderDeliveries.id, deliveryId), eq(smsReminderDeliveries.status, 'processing'))).returning()
  return row ?? null
}
