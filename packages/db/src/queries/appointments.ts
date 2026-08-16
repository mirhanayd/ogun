// Randevu sorguları — GitHub issue #39 / Prompt 7.1. clients.ts üstündeki
// notla AYNI desen: clinicId burada düz bir string, "clinicId'siz sorgu
// yazılamaz" kuralı apps/web/src/lib/authz.ts (ClinicScope) tarafında tip
// seviyesinde zorlanıyor.
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { appointments, clinicHolidays, type AppointmentStatus, type AppointmentType } from '../schema/appointments'
import { clients } from '../schema/clients'
import { users } from '../schema/tenancy'
import type { Database } from '../client'

export interface AppointmentListRow {
  id: string
  clientId: string
  clientFirstName: string
  clientLastName: string
  dietitianId: string
  dietitianName: string
  startsAt: Date
  endsAt: Date
  type: AppointmentType
  status: AppointmentStatus
  location: string | null
  notes: string | null
  packageSessionId: string | null
}

const appointmentListSelection = {
  id: appointments.id,
  clientId: appointments.clientId,
  clientFirstName: clients.firstName,
  clientLastName: clients.lastName,
  dietitianId: appointments.dietitianId,
  dietitianName: users.name,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  type: appointments.type,
  status: appointments.status,
  location: appointments.location,
  notes: appointments.notes,
  packageSessionId: appointments.packageSessionId,
}

// Takvim görünümü (gün/hafta/ay) — [from, to) aralığındaki randevular, danışan
// ve diyetisyen adlarıyla BİRLİKTE (calendar UI ekstra bir sorgu yapmasın
// diye, tıpkı clients.ts listClients'ın assignedDietitianName'i JOIN etmesi
// gibi). dietitianIds verilirse (GÖREV 2 "çoklu diyetisyen filtreleme")
// sonuç o diyetisyenlerle sınırlanır.
export async function listAppointmentsInRange(
  db: Database,
  clinicId: string,
  range: { from: Date; to: Date; dietitianIds?: string[] },
): Promise<AppointmentListRow[]> {
  const conditions = [
    eq(appointments.clinicId, clinicId),
    gte(appointments.startsAt, range.from),
    lte(appointments.startsAt, range.to),
  ]
  if (range.dietitianIds && range.dietitianIds.length > 0) {
    conditions.push(inArray(appointments.dietitianId, range.dietitianIds))
  }
  return db
    .select(appointmentListSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(users, eq(users.id, appointments.dietitianId))
    .where(and(...conditions))
    .orderBy(asc(appointments.startsAt))
}

// Çakışma/reschedule kontrolü İÇİN — sadece zaman aralığı, ilişkili tablolara
// JOIN gerekmez (bkz. apps/web/src/lib/scheduling.ts findConflictingAppointment,
// bu satırları AppointmentInterval şekline dönüştürerek çağırır).
export async function listAppointmentIntervalsInRange(
  db: Database,
  clinicId: string,
  range: { from: Date; to: Date },
) {
  return db
    .select({
      id: appointments.id,
      dietitianId: appointments.dietitianId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.startsAt, range.from),
        lte(appointments.startsAt, range.to),
      ),
    )
}

export async function getAppointmentById(db: Database, clinicId: string, appointmentId: string) {
  const [row] = await db
    .select(appointmentListSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(users, eq(users.id, appointments.dietitianId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

// Danışan detayında "Randevular" sekmesi + randevu geçmişi özeti (GÖREV 3).
export async function listAppointmentsForClient(db: Database, clinicId: string, clientId: string) {
  return db
    .select(appointmentListSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(users, eq(users.id, appointments.dietitianId))
    .where(and(eq(appointments.clinicId, clinicId), eq(appointments.clientId, clientId)))
    .orderBy(desc(appointments.startsAt))
}

// En yakın GELECEK randevu (üst bardaki "Son görüşme" / hızlı özet için) —
// danisanlar/[id]/page.tsx üstündeki "Son görüşme hâlâ '—'" notunun kapandığı
// yer.
export async function getClientNextAppointment(db: Database, clinicId: string, clientId: string, now: Date = new Date()) {
  const [row] = await db
    .select(appointmentListSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(users, eq(users.id, appointments.dietitianId))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.clientId, clientId),
        gte(appointments.startsAt, now),
        inArray(appointments.status, ['planlandı', 'ertelendi']),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(1)
  return row ?? null
}

export interface CreateAppointmentInput {
  clientId: string
  dietitianId: string
  startsAt: Date
  endsAt: Date
  type: AppointmentType
  location?: string | null
  notes?: string | null
}

export async function createAppointment(db: Database, clinicId: string, input: CreateAppointmentInput) {
  const [row] = await db
    .insert(appointments)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('Randevu oluşturulamadı.')
  return row
}

export interface UpdateAppointmentInput {
  clientId?: string
  dietitianId?: string
  startsAt?: Date
  endsAt?: Date
  type?: AppointmentType
  status?: AppointmentStatus
  location?: string | null
  notes?: string | null
}

export async function updateAppointment(
  db: Database,
  clinicId: string,
  appointmentId: string,
  patch: UpdateAppointmentInput,
) {
  const [row] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .returning()
  return row ?? null
}

// Sürükleyerek erteleme (GÖREV 2) — sadece zaman alanlarını günceller, statü
// dokunulmaz kalır (bkz. schema/appointments.ts appointmentStatusEnum
// üstündeki not: 'ertelendi' statüsü BİLİNÇLİ bir işaretleme, sürüklemenin
// otomatik sonucu değil).
export async function rescheduleAppointment(
  db: Database,
  clinicId: string,
  appointmentId: string,
  times: { startsAt: Date; endsAt: Date },
) {
  return updateAppointment(db, clinicId, appointmentId, times)
}

export async function deleteAppointment(db: Database, clinicId: string, appointmentId: string) {
  await db
    .delete(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
}

// --- Klinik tatilleri --------------------------------------------------------

export async function listClinicHolidays(db: Database, clinicId: string) {
  return db
    .select()
    .from(clinicHolidays)
    .where(eq(clinicHolidays.clinicId, clinicId))
    .orderBy(asc(clinicHolidays.date))
}

export interface CreateHolidayInput {
  date: string
  description?: string | null
}

export async function createClinicHoliday(db: Database, clinicId: string, input: CreateHolidayInput) {
  const [row] = await db
    .insert(clinicHolidays)
    .values({ clinicId, ...input })
    .returning()
  return row
}

export async function deleteClinicHoliday(db: Database, clinicId: string, holidayId: string) {
  await db
    .delete(clinicHolidays)
    .where(and(eq(clinicHolidays.id, holidayId), eq(clinicHolidays.clinicId, clinicId)))
}
