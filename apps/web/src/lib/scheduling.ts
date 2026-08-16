// GitHub issue #39 / Prompt 7.1 (Randevu takvimi) — GÖREV 2 + GÖREV 3'ün
// gerektirdiği "saf" (DB/React'tan habersiz, girdi verilen sayı/tarih çıkar)
// zamanlama mantığı. dnd-reorder.ts'teki (GitHub issue #25) desenle AYNI
// gerekçe: bu fonksiyonlar DOM sürükle-bırak simülasyonu KURMADAN, düz
// girdi/çıktı olarak test edilebilsin diye bileşenlerden (calendar-*.tsx)
// AYRI tutuluyor (bkz. scheduling.test.ts).

// --- Çakışma kontrolü -------------------------------------------------------

export interface AppointmentInterval {
  id: string
  dietitianId: string
  startsAt: Date
  endsAt: Date
  // İptal edilmiş randevular çakışma sayılmaz — slot serbest kalır. 'gelmedi'
  // (danışan gelmedi) BİLEREK çakışma sayılmaya DEVAM eder: randevu zamanı
  // geçmişte kalmış olsa da "o dilimde bir randevu VARDI" bilgisi (raporlama,
  // yanlışlıkla ikinci kez aynı slota randevu açma uyarısı) hâlâ anlamlı.
  status: 'planlandı' | 'geldi' | 'gelmedi' | 'iptal' | 'ertelendi'
}

export interface ConflictCandidate {
  dietitianId: string
  startsAt: Date
  endsAt: Date
  // Güncelleme/erteleme senaryosunda kendisiyle çakışma raporlanmasın diye.
  excludeAppointmentId?: string
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

// Aynı diyetisyenin AYNI zaman diliminde başka bir (iptal edilmemiş)
// randevusu var mı? Varsa o randevuyu döner, yoksa null.
export function findConflictingAppointment(
  candidate: ConflictCandidate,
  existing: readonly AppointmentInterval[],
): AppointmentInterval | null {
  for (const appointment of existing) {
    if (appointment.status === 'iptal') continue
    if (appointment.id === candidate.excludeAppointmentId) continue
    if (appointment.dietitianId !== candidate.dietitianId) continue
    if (intervalsOverlap(candidate.startsAt, candidate.endsAt, appointment.startsAt, appointment.endsAt)) {
      return appointment
    }
  }
  return null
}

// --- Çalışma saati dışı uyarısı --------------------------------------------

export interface WorkingHourRow {
  // 1 = Pazartesi ... 7 = Pazar (bkz. packages/db/src/schema/appointments.ts).
  dayOfWeek: number
  // 'HH:MM' veya 'HH:MM:SS' — pg `time` sütunu drizzle'da string döner.
  startTime: string
  endTime: string
  isOpen: boolean
}

export interface HolidayRow {
  // 'YYYY-MM-DD'
  date: string
}

export type OutsideHoursReason = 'holiday' | 'closed_day' | 'outside_hours' | 'no_working_hours'

export interface WorkingHoursCheckResult {
  outside: boolean
  reason: OutsideHoursReason | null
}

function isoWeekday(date: Date): number {
  // JS getDay(): 0 = Pazar ... 6 = Cumartesi → ISO'ya çevir (bkz.
  // schema/appointments.ts üstündeki not, aynı dönüşüm formülü).
  return ((date.getDay() + 6) % 7) + 1
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

// Bir randevunun (startsAt-endsAt) klinik çalışma saatleri VE tatil
// günleriyle uyumlu olup olmadığını kontrol eder. Randevu birden fazla güne
// yayılamayacağı varsayılır (calendar UI zaten aynı gün içinde süre seçtirir)
// — kontrol startsAt'in günü üzerinden yapılır.
export function checkWorkingHours(
  startsAt: Date,
  endsAt: Date,
  workingHours: readonly WorkingHourRow[],
  holidays: readonly HolidayRow[],
): WorkingHoursCheckResult {
  const dateKey = toDateKey(startsAt)
  if (holidays.some((holiday) => holiday.date === dateKey)) {
    return { outside: true, reason: 'holiday' }
  }

  const weekday = isoWeekday(startsAt)
  const hoursForDay = workingHours.find((row) => row.dayOfWeek === weekday)
  if (!hoursForDay) {
    return { outside: true, reason: 'no_working_hours' }
  }
  if (!hoursForDay.isOpen) {
    return { outside: true, reason: 'closed_day' }
  }

  const dayStart = timeStringToMinutes(hoursForDay.startTime)
  const dayEnd = timeStringToMinutes(hoursForDay.endTime)
  const startMinutes = minutesSinceMidnight(startsAt)
  const endMinutes = minutesSinceMidnight(endsAt)
  if (startMinutes < dayStart || endMinutes > dayEnd) {
    return { outside: true, reason: 'outside_hours' }
  }

  return { outside: false, reason: null }
}

export const OUTSIDE_HOURS_REASON_LABELS_TR: Record<OutsideHoursReason, string> = {
  holiday: 'Bu tarih klinik tatili olarak işaretlenmiş.',
  closed_day: 'Klinik bu gün kapalı.',
  outside_hours: 'Seçilen saat, klinik çalışma saatleri dışında.',
  no_working_hours: 'Bu gün için çalışma saati tanımlanmamış.',
}

// --- Sürükleyerek erteleme --------------------------------------------------

export interface RescheduleDragTarget {
  // Bırakılan slotun başlangıç anı (calendar-grid.tsx bir slotu her zaman bu
  // şekilde temsil eder — bkz. o dosyadaki SLOT_MINUTES).
  droppedSlotStart: Date
}

export interface RescheduleUpdate {
  startsAt: Date
  endsAt: Date
}

// Sürükle-bırak sonucundan GERÇEK güncelleme payload'ını çıkarır — randevunun
// SÜRESİ korunur (endsAt - startsAt farkı), sadece başlangıç anı değişir.
// dnd-reorder.ts'teki computeDragEndPlan ile AYNI gerekçeyle bileşenden ayrı:
// "sürükle → hangi updateAppointment çağrısı" eşlemesi DOM olmadan test
// edilsin diye (bkz. scheduling.test.ts).
export function computeRescheduleUpdate(
  original: { startsAt: Date; endsAt: Date },
  target: RescheduleDragTarget,
): RescheduleUpdate {
  const durationMs = original.endsAt.getTime() - original.startsAt.getTime()
  const startsAt = target.droppedSlotStart
  const endsAt = new Date(startsAt.getTime() + durationMs)
  return { startsAt, endsAt }
}
