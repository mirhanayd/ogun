'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  consumeClientPackageSession,
  createAppointment,
  createClinicHoliday,
  deleteClinicHoliday,
  getActiveClientPackageForClient,
  getWorkingHoursForClinic,
  listAppointmentIntervalsInRange,
  listClients,
  listClinicHolidays,
  rescheduleAppointment,
  updateAppointment,
} from '@ogun/db/queries'
import type { AppointmentStatus } from '@ogun/db/schema'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  checkWorkingHours,
  findConflictingAppointment,
  OUTSIDE_HOURS_REASON_LABELS_TR,
  type WorkingHourRow,
} from '@/lib/scheduling'
import {
  appointmentFormSchema,
  appointmentFormToDateRange,
  type AppointmentFormInput,
} from '@/lib/validation/appointment-schemas'
import { getAppointmentDetail, getClientPackageWarning } from './queries'

// GitHub issue #39 / Prompt 7.1 — randevu mutasyonları. danisanlar/actions.ts
// (GitHub issue #17) ile AYNI dönüş deseni: fırlatmak yerine bir sonuç
// nesnesi.
export interface AppointmentActionResult {
  success: boolean
  error?: string
  // Çakışma dışında, ENGELLEMEYEN bir uyarı (çalışma saati dışı/tatil) —
  // GÖREV 3 "çalışma saati dışı UYARISI" istiyor, HATA değil: diyetisyen
  // isteyerek mesai dışı bir randevu açabilir (ör. acil bir online görüşme).
  // UI bu durumda bir onay adımı gösterip acknowledgeWarning: true ile
  // action'ı TEKRAR çağırır (bkz. appointment-dialog.tsx).
  warning?: string
  appointmentId?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

function dayRange(date: Date): { from: Date; to: Date } {
  const from = new Date(date)
  from.setHours(0, 0, 0, 0)
  const to = new Date(date)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

// Çakışma + çalışma saati dışı kontrolünü yapan ortak yardımcı — hem
// oluşturma hem erteleme akışı AYNI kontrolden geçer (GÖREV 3 kuralı iki
// yerde de geçerli: "sürükleyerek erteleme" de bir çakışma yaratabilir).
async function checkAvailability(
  clinicId: string,
  input: { dietitianId: string; startsAt: Date; endsAt: Date; excludeAppointmentId?: string },
): Promise<{ conflictError: string | null; hoursWarning: string | null }> {
  const { from, to } = dayRange(input.startsAt)
  const [intervals, workingHours, holidays] = await Promise.all([
    listAppointmentIntervalsInRange(db, clinicId, { from, to }),
    getWorkingHoursForClinic(db, clinicId),
    listClinicHolidays(db, clinicId),
  ])

  const conflict = findConflictingAppointment(
    {
      dietitianId: input.dietitianId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      excludeAppointmentId: input.excludeAppointmentId,
    },
    intervals,
  )
  const conflictError = conflict
    ? `Bu diyetisyenin ${conflict.startsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - ${conflict.endsAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} arasında başka bir randevusu var.`
    : null

  const hoursCheck = checkWorkingHours(
    input.startsAt,
    input.endsAt,
    workingHours as WorkingHourRow[],
    holidays,
  )
  const hoursWarning = hoursCheck.outside ? OUTSIDE_HOURS_REASON_LABELS_TR[hoursCheck.reason!] : null

  return { conflictError, hoursWarning }
}

// --- Randevu oluşturma / güncelleme (GÖREV 3) -------------------------------

const createAppointmentForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'appointment',
      entityId: (_args: unknown[], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (
      ctx,
      input: {
        clientId: string
        dietitianId: string
        startsAt: Date
        endsAt: Date
        type: AppointmentFormInput['type']
        location: string | null
        notes: string | null
        packageSessionId: string | null
      },
    ) =>
      createAppointment(db, ctx.scope.clinicId, {
        clientId: input.clientId,
        dietitianId: input.dietitianId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        type: input.type,
        location: input.location,
        notes: input.notes,
        packageSessionId: input.packageSessionId,
      }),
  ),
)

// GitHub issue #40 / Prompt 7.2 — appointments.packageSessionId placeholder'ının
// ÇÖZÜMÜ (bkz. schema/appointments.ts üstündeki not). Danışanın 'aktif'
// durumdaki bir paketi varsa (bkz. queries/billing.ts getActiveClientPackageForClient)
// yeni randevu OTOMATİK o pakete bağlanır — diyetisyen manuel bir seçim
// yapmak ZORUNDA değil (spec bunu istemedi, "basit tut" ruhuyla otomatik
// bağlama tercih edildi). Sayaç (sessionsUsed) burada DEĞİL, randevu 'geldi'
// işaretlendiğinde artırılır (bkz. updateAppointmentStatusAction).
const resolveActivePackageForClient = withAuth(async (ctx, clientId: string) => {
  const activePackage = await getActiveClientPackageForClient(db, ctx.scope.clinicId, clientId)
  return activePackage?.id ?? null
})

export async function createAppointmentAction(
  input: AppointmentFormInput,
  acknowledgeWarning = false,
): Promise<AppointmentActionResult> {
  const parsed = appointmentFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  const { startsAt, endsAt } = appointmentFormToDateRange(parsed.data)

  // checkAvailability clinicId gerektirir — bu yüzden withAuth() ile sarılmış
  // ayrı bir yardımcı action üzerinden GERÇEK (doğrulanmış) scope'a erişilir,
  // tıpkı diğer mutasyonlarda olduğu gibi.
  const wrapped = withAuth(async (ctx) => {
    const { conflictError, hoursWarning } = await checkAvailability(ctx.scope.clinicId, {
      dietitianId: parsed.data.dietitianId,
      startsAt,
      endsAt,
    })
    return { conflictError, hoursWarning }
  })
  const { conflictError, hoursWarning } = await wrapped()

  if (conflictError) {
    return { success: false, error: conflictError }
  }
  if (hoursWarning && !acknowledgeWarning) {
    return { success: false, warning: hoursWarning }
  }

  try {
    const packageSessionId = await resolveActivePackageForClient(parsed.data.clientId)
    const created = await createAppointmentForClinic({
      clientId: parsed.data.clientId,
      dietitianId: parsed.data.dietitianId,
      startsAt,
      endsAt,
      type: parsed.data.type,
      location: parsed.data.location || null,
      notes: parsed.data.notes || null,
      packageSessionId,
    })
    revalidatePath('/randevular')
    revalidatePath(`/danisanlar/${parsed.data.clientId}`)
    return { success: true, appointmentId: created?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Randevu oluşturulamadı.' }
  }
}

const updateAppointmentForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'appointment',
      entityId: ([id]: [string, Parameters<typeof updateAppointment>[3]]) => id,
    },
    async (
      ctx,
      appointmentId: string,
      patch: Parameters<typeof updateAppointment>[3],
    ) => updateAppointment(db, ctx.scope.clinicId, appointmentId, patch),
  ),
)

export async function updateAppointmentAction(
  appointmentId: string,
  clientId: string,
  input: AppointmentFormInput,
  acknowledgeWarning = false,
): Promise<AppointmentActionResult> {
  const parsed = appointmentFormSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  const { startsAt, endsAt } = appointmentFormToDateRange(parsed.data)

  const checkWrapped = withAuth(async (ctx) =>
    checkAvailability(ctx.scope.clinicId, {
      dietitianId: parsed.data.dietitianId,
      startsAt,
      endsAt,
      excludeAppointmentId: appointmentId,
    }),
  )
  const { conflictError, hoursWarning } = await checkWrapped()
  if (conflictError) return { success: false, error: conflictError }
  if (hoursWarning && !acknowledgeWarning) return { success: false, warning: hoursWarning }

  try {
    await updateAppointmentForClinic(appointmentId, {
      clientId: parsed.data.clientId,
      dietitianId: parsed.data.dietitianId,
      startsAt,
      endsAt,
      type: parsed.data.type,
      location: parsed.data.location || null,
      notes: parsed.data.notes || null,
    })
    revalidatePath('/randevular')
    revalidatePath(`/danisanlar/${clientId}`)
    return { success: true, appointmentId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Randevu güncellenemedi.' }
  }
}

// --- Sürükleyerek erteleme (GÖREV 2) ----------------------------------------

const rescheduleAppointmentForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'appointment',
      entityId: ([id]: [string, { startsAt: Date; endsAt: Date }]) => id,
    },
    async (ctx, appointmentId: string, times: { startsAt: Date; endsAt: Date }) =>
      rescheduleAppointment(db, ctx.scope.clinicId, appointmentId, times),
  ),
)

export async function rescheduleAppointmentAction(
  appointmentId: string,
  dietitianId: string,
  clientId: string,
  startsAt: Date,
  endsAt: Date,
  acknowledgeWarning = false,
): Promise<AppointmentActionResult> {
  const checkWrapped = withAuth(async (ctx) =>
    checkAvailability(ctx.scope.clinicId, { dietitianId, startsAt, endsAt, excludeAppointmentId: appointmentId }),
  )
  const { conflictError, hoursWarning } = await checkWrapped()
  if (conflictError) return { success: false, error: conflictError }
  if (hoursWarning && !acknowledgeWarning) return { success: false, warning: hoursWarning }

  try {
    await rescheduleAppointmentForClinic(appointmentId, { startsAt, endsAt })
    revalidatePath('/randevular')
    revalidatePath(`/danisanlar/${clientId}`)
    return { success: true, appointmentId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Randevu ertelenemedi.' }
  }
}

// --- Statü değişimi (GÖREV 4 — "Geldi" zincirinin ilk adımı) ----------------

const updateAppointmentStatusForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'appointment',
      entityId: ([id]: [string, AppointmentStatus]) => id,
    },
    async (ctx, appointmentId: string, status: AppointmentStatus) =>
      updateAppointment(db, ctx.scope.clinicId, appointmentId, { status }),
  ),
)

// GitHub issue #40 / Prompt 7.2 — bir randevu bu pakete bağlıysa (bkz.
// createAppointmentForClinic'in otomatik bağlaması) sessionsUsed sayacı
// BURADA artırılır — "planlandı"da değil "geldi"de, no-show/iptal bir seans
// harcamasın diye (bkz. schema/appointments.ts packageSessionId notu).
const consumeSessionForClinic = withAuth(
  withAudit(
    { action: 'update', entityType: 'client_package', entityId: ([id]: [string]) => id },
    async (ctx, clientPackageId: string) => consumeClientPackageSession(db, ctx.scope.clinicId, clientPackageId),
  ),
)

export async function updateAppointmentStatusAction(
  appointmentId: string,
  clientId: string,
  status: AppointmentStatus,
): Promise<AppointmentActionResult> {
  try {
    const updated = await updateAppointmentStatusForClinic(appointmentId, status)
    if (status === 'geldi' && updated?.packageSessionId) {
      await consumeSessionForClinic(updated.packageSessionId)
    }
    revalidatePath('/randevular')
    revalidatePath(`/danisanlar/${clientId}`)
    revalidatePath('/finans')
    return { success: true, appointmentId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Randevu durumu güncellenemedi.' }
  }
}

// --- Klinik tatilleri --------------------------------------------------------

const createHolidayForClinic = withAuth(
  withAudit(
    { action: 'create', entityType: 'clinic_holiday' },
    async (ctx, input: { date: string; description: string | null }) =>
      createClinicHoliday(db, ctx.scope.clinicId, input),
  ),
)

export async function createHolidayAction(date: string, description: string): Promise<AppointmentActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: 'Geçerli bir tarih giriniz.' }
  }
  try {
    await createHolidayForClinic({ date, description: description.trim() || null })
    revalidatePath('/randevular')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Tatil eklenemedi.' }
  }
}

const deleteHolidayForClinic = withAuth(
  withAudit(
    { action: 'delete', entityType: 'clinic_holiday', entityId: ([id]: [string]) => id },
    async (ctx, holidayId: string) => deleteClinicHoliday(db, ctx.scope.clinicId, holidayId),
  ),
)

export async function deleteHolidayAction(holidayId: string): Promise<AppointmentActionResult> {
  try {
    await deleteHolidayForClinic(holidayId)
    revalidatePath('/randevular')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Tatil silinemedi.' }
  }
}

// --- Danışan seç (komut paleti / ClientPicker) ------------------------------

// queries.ts'teki searchClientsForAppointment ile AYNI sorgu — burada AYRICA
// bir 'use server' action olarak var çünkü queries.ts sunucu bileşenlerinden
// çağrılmak üzere tasarlandı ('server-only'), istemci bileşenleri (ör.
// client-picker.tsx, command-palette.tsx) sadece BU dosyadaki ('use server')
// action'ları çağırabilir. İkisi AYNI withAuth(withAudit(listClients(...)))
// sorgusunu sarmaladığı için mantık TEKRARLANMIYOR.
const searchClientsForClinic = withAuth(
  withAudit(
    { action: 'read', entityType: 'client', metadata: ([query]: [string]) => ({ query }) },
    async (ctx, query: string) => {
      const result = await listClients(db, ctx.scope.clinicId, {
        search: query,
        status: 'aktif',
        pageSize: 8,
      })
      return result.rows
    },
  ),
)

export interface ClientPickerOption {
  id: string
  firstName: string
  lastName: string
}

export async function searchClientsAction(query: string): Promise<ClientPickerOption[]> {
  if (query.trim().length === 0) return []
  const rows = await searchClientsForClinic(query)
  return rows.map((row) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName }))
}

// GitHub issue #40 / Prompt 7.2, GÖREV 2 — istemci bileşenleri (AppointmentDialog)
// queries.ts'i DOĞRUDAN içe aktaramaz ('server-only'), searchClientsForClinic
// İLE AYNI gerekçeyle bu ince sarmalayıcı ekleniyor.
export async function getClientPackageWarningAction(clientId: string, clientName: string): Promise<string | null> {
  return getClientPackageWarning(clientId, clientName)
}

// --- Randevu detayı ("10 saniyede hazırlansın") ------------------------------

// İstemci bileşenleri (appointment-detail-sheet.tsx) queries.ts'i DOĞRUDAN
// içe aktaramaz ('server-only') — bu ince sarmalayıcı SADECE aynı fonksiyonu
// bir 'use server' action olarak yeniden sunuyor, mantık TEKRARLANMIYOR.
export async function fetchAppointmentDetailAction(appointmentId: string) {
  return getAppointmentDetail(appointmentId)
}
