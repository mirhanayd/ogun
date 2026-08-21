import 'server-only'
import { db } from '@ogun/db'
import {
  getActiveClientPackageForClient,
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
import { assertClientAccess, withAuth, withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { isLowSessionWarning, lowSessionWarningMessage } from '@/lib/billing/client-package'

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
      listAppointmentsInRange(db, ctx.scope.clinicId, {
        ...range,
        ...(ctx.role === 'dietitian' ? { visibleToDietitianId: ctx.user.id } : {}),
      }),
  ),
)

export const getDietitianOptions = withAuth(
  withAudit(
    { action: 'read', entityType: 'clinic_member' },
    async (ctx) => {
      const dietitians = await listClinicDietitians(db, ctx.scope.clinicId)
      return ctx.role === 'dietitian'
        ? dietitians.filter((dietitian) => dietitian.id === ctx.user.id)
        : dietitians
    },
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
      await assertClientAccess(ctx, appointment.clientId)

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
export const getClientNextAppointment = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'appointment', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => getClientNextAppointmentQuery(db, ctx.scope.clinicId, clientId),
  ),
)

// Danışan detay sayfası "Randevular" sekmesi (GÖREV 3).
export const getClientAppointments = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'appointment', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => listAppointmentsForClient(db, ctx.scope.clinicId, clientId),
  ),
)

// GitHub issue #40 / Prompt 7.2, GÖREV 2 — "Kalan seans 1'e düşünce randevu
// ekranında uyarı". AppointmentDialog danışan seçilince bunu çağırır (bkz.
// actions.ts getClientPackageWarningAction, istemci bileşenleri bu dosyayı
// DOĞRUDAN import edemez). Uyarı ENGELLEYİCİ değil — checkAvailability'nin
// çakışma/çalışma saati uyarısından FARKLI olarak sadece bilgilendirir,
// kaydı durdurmaz.
export const getClientPackageWarning = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'client_package', entityId: ([clientId]: [string, string]) => clientId },
    async (ctx, clientId: string, clientName: string) => {
      const activePackage = await getActiveClientPackageForClient(db, ctx.scope.clinicId, clientId)
      if (!activePackage || !isLowSessionWarning(activePackage)) return null
      return lowSessionWarningMessage(clientName, activePackage)
    },
  ),
)
