import 'server-only'
import { db } from '@ogun/db'
import {
  getAppointmentById,
  getClientNextAppointment as getClientNextAppointmentQuery,
  getLatestMeasurement,
  listAppointmentIntervalsInRange,
  listAppointmentsForClient,
  listAppointmentsInRange,
  listClinicDietitians,
  listClinicHolidays,
  listPlans,
  getWorkingHoursForClinic,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// GitHub issue #39 / Prompt 7.1 — randevu okumaları. measurements/queries.ts
// (GitHub issue #18) ile AYNI desen: server action DEĞİL, sadece
// withAuth(withAudit(...)) ile sarılmış normal sunucu fonksiyonları. Randevu
// da danışan verisine (clientId üzerinden) dokunduğu için okuma da denetlenir.

export const getCalendarAppointments = withAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'appointment',
      metadata: ([range]: [{ from: Date; to: Date; dietitianIds?: string[] }]) => ({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        dietitianIds: range.dietitianIds,
      }),
    },
    async (ctx, range: { from: Date; to: Date; dietitianIds?: string[] }) =>
      listAppointmentsInRange(db, ctx.scope.clinicId, range),
  ),
)

export const getDietitianOptions = withAuth(
  withAudit(
    { action: 'read', entityType: 'clinic_member' },
    async (ctx) => listClinicDietitians(db, ctx.scope.clinicId),
  ),
)

export const getWorkingHoursAndHolidays = withAuth(
  withAudit(
    { action: 'read', entityType: 'clinic_working_hours' },
    async (ctx) => {
      const [workingHours, holidays] = await Promise.all([
        getWorkingHoursForClinic(db, ctx.scope.clinicId),
        listClinicHolidays(db, ctx.scope.clinicId),
      ])
      return { workingHours, holidays }
    },
  ),
)

// Çakışma kontrolü İÇİN — [from, to) aralığındaki mevcut randevu zaman
// dilimleri (bkz. lib/scheduling.ts findConflictingAppointment).
export const getAppointmentIntervals = withAuth(
  withAudit(
    { action: 'read', entityType: 'appointment' },
    async (ctx, range: { from: Date; to: Date }) =>
      listAppointmentIntervalsInRange(db, ctx.scope.clinicId, range),
  ),
)

// Danışan seç adımı (komut paleti / ClientPicker) — bkz. actions.ts
// searchClientsAction (BURADA DEĞİL: istemci bileşenleri sadece 'use server'
// action'ları çağırabilir, bu dosya 'server-only' okuma fonksiyonları içindir).

// Randevu detayı: "diyetisyen randevuya girmeden 10 saniyede hazırlansın"
// (GÖREV 3) — geçmiş ölçüm özeti, aktif plan, son notlar TEK sorgu turunda
// birlikte gelir. Mevcut modüllerin (measurements, plans) sorgularını
// AYNEN çağırır, veriyi yeniden türetmez.
export const getAppointmentDetail = withAuth(
  withAudit(
    { action: 'read', entityType: 'appointment', entityId: ([appointmentId]: [string]) => appointmentId },
    async (ctx, appointmentId: string) => {
      const appointment = await getAppointmentById(db, ctx.scope.clinicId, appointmentId)
      if (!appointment) return null

      const [latestMeasurement, activePlan, history] = await Promise.all([
        getLatestMeasurement(db, ctx.scope.clinicId, appointment.clientId),
        listPlans(db, ctx.scope.clinicId, { clientId: appointment.clientId, status: 'aktif' }),
        listAppointmentsForClient(db, ctx.scope.clinicId, appointment.clientId),
      ])

      const pastAppointments = history.filter(
        (row) => row.id !== appointmentId && row.startsAt < appointment.startsAt,
      )
      const lastNote = pastAppointments.find((row) => row.notes)?.notes ?? null

      return {
        appointment,
        latestMeasurement,
        activePlan: activePlan[0] ?? null,
        recentAppointmentCount: pastAppointments.length,
        lastAppointmentNote: lastNote,
      }
    },
  ),
)

// En yakın gelecek randevu — danisanlar/[id]/page.tsx üst bardaki "Sonraki
// randevu" özeti (bkz. o dosyanın üstündeki eski "Son görüşme hâlâ '—'" notu).
export const getClientNextAppointment = withAuth(
  withAudit(
    { action: 'read', entityType: 'appointment', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => getClientNextAppointmentQuery(db, ctx.scope.clinicId, clientId),
  ),
)

// Danışan detay sayfası "Randevular" sekmesi (GÖREV 3).
export const getClientAppointments = withAuth(
  withAudit(
    { action: 'read', entityType: 'appointment', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => listAppointmentsForClient(db, ctx.scope.clinicId, clientId),
  ),
)
