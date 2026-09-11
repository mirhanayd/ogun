import 'server-only'
import { db, type Database } from '@ogun/db'
import {
  cancelSmsReminderDelivery,
  claimSmsReminderDelivery,
  countSentSmsInPeriod,
  getAppointmentReminderState,
  getClinicById,
  getSmsLogForAppointment,
  listAppointmentReminderCandidates,
  listSmsReminderClinicIds,
  markSmsReminderFailed,
  markSmsReminderSent,
  markSmsReminderUnknown,
  recordSmsReminderNoConsent,
  withOperationalJobLock,
} from '@ogun/db/queries'
import { isRetryableDeliveryError, safeDeliveryErrorCode } from '@ogun/db/operations'
import { getSmsSender } from './index'
import type { SmsSender } from './types'
import { decideReminderForAppointment } from './reminder-eligibility'
import { renderSmsReminderMessage } from './reminder-template'

const REMINDER_LOOKAHEAD_HOURS = 24
const REMINDER_LOOKAHEAD_PADDING_MINUTES = 30
const GLOBAL_CLINIC_BATCH = 100
const CLINIC_CONCURRENCY = 4

export interface ReminderSweepResult {
  sent: number
  skippedNoConsent: number
  skippedOther: number
  errors: number
  unknown: number
}

interface SweepDependencies {
  database?: Database
  sender?: SmsSender
}

export async function runSmsReminderSweepForClinic(
  clinicId: string,
  now: Date = new Date(),
  dependencies: SweepDependencies = {},
): Promise<ReminderSweepResult> {
  const database = dependencies.database ?? db
  const clinic = await getClinicById(database, clinicId)
  if (!clinic) throw new Error('Klinik bulunamadı.')
  const until = new Date(now.getTime() + (REMINDER_LOOKAHEAD_HOURS * 60 + REMINDER_LOOKAHEAD_PADDING_MINUTES) * 60_000)
  const candidates = await listAppointmentReminderCandidates(database, clinicId, now, until)
  const sender = dependencies.sender ?? getSmsSender()
  const result: ReminderSweepResult = { sent: 0, skippedNoConsent: 0, skippedOther: 0, errors: 0, unknown: 0 }

  for (const candidate of candidates) {
    const legacyLog = await getSmsLogForAppointment(database, clinicId, candidate.appointmentId)
    const decision = decideReminderForAppointment(
      { appointmentId: candidate.appointmentId, startsAt: candidate.startsAt, status: candidate.status },
      { smsConsentAt: candidate.clientSmsConsentAt, phone: candidate.clientPhone },
      legacyLog !== null,
      now,
    )
    if (!decision.shouldSend) {
      if (decision.reason === 'rıza_yok' && !legacyLog) {
        const recorded = await recordSmsReminderNoConsent(database, {
          clinicId, appointmentId: candidate.appointmentId, clientId: candidate.clientId,
          phone: candidate.clientPhone ?? '', provider: sender.name, now,
        })
        if (recorded) result.skippedNoConsent += 1
      } else if (decision.reason !== 'zaten_gönderildi') result.skippedOther += 1
      continue
    }

    const delivery = await claimSmsReminderDelivery(database, {
      clinicId, appointmentId: candidate.appointmentId, clientId: candidate.clientId, now,
    })
    if (!delivery) {
      result.skippedOther += 1
      continue
    }

    const current = await getAppointmentReminderState(database, clinicId, candidate.appointmentId)
    const currentDecision = current ? decideReminderForAppointment(
      { appointmentId: current.appointmentId, startsAt: current.startsAt, status: current.status },
      { smsConsentAt: current.clientSmsConsentAt, phone: current.clientPhone },
      false,
      now,
    ) : { shouldSend: false as const, reason: 'uygun_durum_değil' as const }
    if (!current || !currentDecision.shouldSend) {
      await cancelSmsReminderDelivery(database, delivery.id, now)
      result.skippedOther += 1
      continue
    }

    const message = renderSmsReminderMessage(clinic.smsReminderTemplate, {
      clientName: `${current.clientFirstName} ${current.clientLastName}`,
      clinicName: clinic.name,
      appointmentDate: current.startsAt.toLocaleDateString('tr-TR'),
      appointmentTime: current.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    })

    let providerAccepted = false
    try {
      const providerResult = await sender.send({ to: current.clientPhone as string, message })
      providerAccepted = true
      const finalized = await markSmsReminderSent(database, {
        deliveryId: delivery.id, clinicId, clientId: current.clientId,
        appointmentId: current.appointmentId, phone: current.clientPhone as string,
        message, provider: sender.name, providerMessageId: providerResult.externalMessageId, now,
      })
      if (!finalized) {
        await markSmsReminderUnknown(database, delivery.id, now)
        result.unknown += 1
      } else result.sent += 1
    } catch (error) {
      if (providerAccepted) {
        await markSmsReminderUnknown(database, delivery.id, now).catch(() => null)
        result.unknown += 1
      } else {
        await markSmsReminderFailed(database, {
          deliveryId: delivery.id,
          retryable: isRetryableDeliveryError(error),
          errorCode: safeDeliveryErrorCode(error),
          appointmentStartsAt: current.startsAt,
          now,
        })
        result.errors += 1
      }
    }
  }
  return result
}

export async function runSmsReminderOperationalJob(
  trigger: 'cron' | 'manual' | 'test',
  options: { now?: Date; database?: Database; sender?: SmsSender } = {},
) {
  const database = options.database ?? db
  const now = options.now ?? new Date()
  return withOperationalJobLock(database, { jobName: 'sms_reminders', trigger, now }, async () => {
    const until = new Date(now.getTime() + (REMINDER_LOOKAHEAD_HOURS * 60 + REMINDER_LOOKAHEAD_PADDING_MINUTES) * 60_000)
    const clinics = await listSmsReminderClinicIds(database, now, until, GLOBAL_CLINIC_BATCH)
    const totals: ReminderSweepResult = { sent: 0, skippedNoConsent: 0, skippedOther: 0, errors: 0, unknown: 0 }
    for (let offset = 0; offset < clinics.length; offset += CLINIC_CONCURRENCY) {
      const batch = clinics.slice(offset, offset + CLINIC_CONCURRENCY)
      const settled = await Promise.allSettled(batch.map(({ clinicId }) => runSmsReminderSweepForClinic(clinicId, now, {
        database, sender: options.sender,
      })))
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          totals.sent += item.value.sent
          totals.skippedNoConsent += item.value.skippedNoConsent
          totals.skippedOther += item.value.skippedOther
          totals.errors += item.value.errors
          totals.unknown += item.value.unknown
        } else totals.errors += 1
      }
    }
    return {
      counts: {
        attempted: totals.sent + totals.errors + totals.unknown + totals.skippedNoConsent + totals.skippedOther,
        succeeded: totals.sent,
        failed: totals.errors + totals.unknown,
        skipped: totals.skippedNoConsent + totals.skippedOther,
      },
      metadata: { clinics: clinics.length, unknown: totals.unknown, noConsent: totals.skippedNoConsent },
    }
  })
}

export async function getSmsUsageThisPeriod(clinicId: string, periodStart: Date | null): Promise<number> {
  const since = periodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  return countSentSmsInPeriod(db, clinicId, since)
}
