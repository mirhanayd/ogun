import 'server-only'
import { db } from '@ogun/db'
import {
  countSentSmsInPeriod,
  getClinicById,
  getSmsLogForAppointment,
  insertSmsLog,
  listAppointmentReminderCandidates,
} from '@ogun/db/queries'
import { getSmsSender } from './index'
import { decideReminderForAppointment } from './reminder-eligibility'
import { renderSmsReminderMessage } from './reminder-template'

// GitHub issue #41 / Prompt 7.3, GÖREV 3 — "24 saat önce OTOMATİK SMS"
// akışının SUNUCU tarafı orkestrasyon katmanı. reminder-eligibility.ts'teki
// SAF karara (decideReminderForAppointment) göre HAREKET EDER: provider'ı
// çağırır, sonucu sms_logs'a yazar. Bu fonksiyonun KENDİSİNİ periyodik
// tetikleyecek bir cron/worker bu repoda HENÜZ YOK (bkz.
// reminder-eligibility.ts dosya başı notu) — runOnce, manuel bir "şimdi
// çalıştır" server action'ından (bkz. ayarlar/abonelik/actions.ts
// runSmsReminderSweepAction) VEYA ileride eklenecek bir zamanlayıcıdan
// çağrılabilecek şekilde tasarlandı; girdi olarak sadece clinicId alır,
// çıktı olarak ne kadar SMS gönderildiğini/atlandığını raporlar.
const REMINDER_LOOKAHEAD_HOURS = 24
const REMINDER_LOOKAHEAD_PADDING_MINUTES = 30

export interface ReminderSweepResult {
  sent: number
  skippedNoConsent: number
  skippedOther: number
  errors: number
}

export async function runSmsReminderSweepForClinic(clinicId: string, now: Date = new Date()): Promise<ReminderSweepResult> {
  const clinic = await getClinicById(db, clinicId)
  if (!clinic) throw new Error('Klinik bulunamadı.')

  const until = new Date(
    now.getTime() + (REMINDER_LOOKAHEAD_HOURS * 60 + REMINDER_LOOKAHEAD_PADDING_MINUTES) * 60 * 1000,
  )
  const candidates = await listAppointmentReminderCandidates(db, clinicId, now, until)
  const sender = getSmsSender()

  const result: ReminderSweepResult = { sent: 0, skippedNoConsent: 0, skippedOther: 0, errors: 0 }

  for (const candidate of candidates) {
    const existingLog = await getSmsLogForAppointment(db, clinicId, candidate.appointmentId)
    const decision = decideReminderForAppointment(
      { appointmentId: candidate.appointmentId, startsAt: candidate.startsAt, status: candidate.status },
      { smsConsentAt: candidate.clientSmsConsentAt, phone: candidate.clientPhone },
      existingLog !== null,
      now,
    )

    if (!decision.shouldSend) {
      // Sadece 'rıza_yok' KAYDA DEĞER (bkz. schema/sms.ts smsLogStatusEnum
      // notu) — 'zaman_penceresi_dışı'/'uygun_durum_değil' her sweep'te
      // TEKRAR TEKRAR değerlendirilecek geçici durumlar, log YAZILMAZ (aksi
      // halde sms_logs, her 15 dakikalık sweep'te aynı randevu için gürültü
      // satırlarla dolar). 'zaten_gönderildi' zaten mevcut bir log demek,
      // tekrar yazmaya gerek yok.
      if (decision.reason === 'rıza_yok' && !existingLog) {
        await insertSmsLog(db, clinicId, {
          clientId: candidate.clientId,
          appointmentId: candidate.appointmentId,
          phone: candidate.clientPhone ?? '',
          message: '',
          status: 'rıza_yok',
          provider: sender.name,
          errorMessage: 'Danışanın SMS rızası yok.',
        })
        result.skippedNoConsent += 1
      } else if (decision.reason !== 'zaten_gönderildi') {
        result.skippedOther += 1
      }
      continue
    }

    const message = renderSmsReminderMessage(clinic.smsReminderTemplate, {
      clientName: `${candidate.clientFirstName} ${candidate.clientLastName}`,
      clinicName: clinic.name,
      appointmentDate: candidate.startsAt.toLocaleDateString('tr-TR'),
      appointmentTime: candidate.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    })

    try {
      await sender.send({ to: candidate.clientPhone as string, message })
      await insertSmsLog(db, clinicId, {
        clientId: candidate.clientId,
        appointmentId: candidate.appointmentId,
        phone: candidate.clientPhone as string,
        message,
        status: 'gönderildi',
        provider: sender.name,
      })
      result.sent += 1
    } catch (error) {
      await insertSmsLog(db, clinicId, {
        clientId: candidate.clientId,
        appointmentId: candidate.appointmentId,
        phone: candidate.clientPhone as string,
        message,
        status: 'başarısız',
        provider: sender.name,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      result.errors += 1
    }
  }

  return result
}

// Kota takibi (GÖREV 3) — cari abonelik dönemi başlangıcından bu yana
// başarıyla gönderilen SMS sayısı (bkz. queries/sms.ts countSentSmsInPeriod
// notu). `periodStart` verilmezse (henüz aboneliği olmayan/deneme
// aşamasındaki klinikler) takvim ayının başı kullanılır.
export async function getSmsUsageThisPeriod(clinicId: string, periodStart: Date | null): Promise<number> {
  const since = periodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  return countSentSmsInPeriod(db, clinicId, since)
}
