import type { WorkingHourFormValue } from '@/lib/validation/onboarding-schemas'

// dayOfWeek: 1 = Pazartesi ... 7 = Pazar (bkz. packages/db/src/schema/appointments.ts).
export const WEEKDAYS_TR: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Pazartesi' },
  { value: 2, label: 'Salı' },
  { value: 3, label: 'Çarşamba' },
  { value: 4, label: 'Perşembe' },
  { value: 5, label: 'Cuma' },
  { value: 6, label: 'Cumartesi' },
  { value: 7, label: 'Pazar' },
]

export const DEFAULT_PRIMARY_COLOR = '#1b7a5a'

// Varsayılan çalışma saatleri şablonu: hafta içi 09:00-18:00 açık, hafta
// sonu kapalı. Kullanıcı adım 3'te bunu düzenleyebilir.
export function buildDefaultWorkingHours(): WorkingHourFormValue[] {
  return WEEKDAYS_TR.map(({ value }) => ({
    dayOfWeek: value,
    isOpen: value >= 1 && value <= 5,
    startTime: '09:00',
    endTime: '18:00',
  }))
}

// Veritabanından gelen (kısmi olabilir — hiç kayıt yoksa boş) çalışma saati
// satırlarını, eksik günleri varsayılanla tamamlayarak 7 elemanlı, sıralı bir
// diziye dönüştürür. Onboarding sihirbazının adım 3 formunu doldurmak için.
export function mergeWorkingHours(
  saved: ReadonlyArray<{ dayOfWeek: number; isOpen: boolean; startTime: string; endTime: string }>,
): WorkingHourFormValue[] {
  const byDay = new Map(saved.map((row) => [row.dayOfWeek, row]))
  return WEEKDAYS_TR.map(({ value }) => {
    const existing = byDay.get(value)
    if (existing) {
      return {
        dayOfWeek: value,
        isOpen: existing.isOpen,
        // Postgres 'time' sütunu "09:00:00" döndürür — forma "09:00" olarak veriyoruz.
        startTime: existing.startTime.slice(0, 5),
        endTime: existing.endTime.slice(0, 5),
      }
    }
    return { dayOfWeek: value, isOpen: value >= 1 && value <= 5, startTime: '09:00', endTime: '18:00' }
  })
}
