// SMS sorguları — GitHub issue #41 / Prompt 7.3, GÖREV 3. clients.ts/
// appointments.ts üstündeki notla AYNI desen: clinicId düz bir string.
import { and, count, eq, gte, inArray, lte } from 'drizzle-orm'
import { appointments, type AppointmentStatus } from '../schema/appointments'
import { clients } from '../schema/clients'
import { smsLogs, type SmsLogStatus } from '../schema/sms'
import type { Database } from '../client'

export interface InsertSmsLogInput {
  clientId: string
  appointmentId?: string | null
  phone: string
  message: string
  status: SmsLogStatus
  provider: string
  errorMessage?: string | null
  sentAt?: Date
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
