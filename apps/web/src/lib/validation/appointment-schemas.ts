import { z } from 'zod'
// TİP-ONLY içe aktarım — client-schemas.ts/measurement-schemas.ts ile AYNI
// desen: drizzle-orm'u istemci paketine sürüklememek için değer listeleri
// burada elle tekrar tanımlanıyor.
import type { AppointmentStatus, AppointmentType } from '@ogun/db/schema'

// ---------------------------------------------------------------------------
// Sözlükler (UI etiketleri) — GitHub issue #39 / Prompt 7.1, GÖREV 1
// ---------------------------------------------------------------------------

export const APPOINTMENT_TYPE_OPTIONS: { value: AppointmentType; label: string }[] = [
  { value: 'ilk_görüşme', label: 'İlk görüşme' },
  { value: 'kontrol', label: 'Kontrol' },
  { value: 'online', label: 'Online' },
  { value: 'ölçüm', label: 'Ölçüm' },
]
export const APPOINTMENT_TYPE_LABELS_TR: Record<AppointmentType, string> = {
  ilk_görüşme: 'İlk görüşme',
  kontrol: 'Kontrol',
  online: 'Online',
  ölçüm: 'Ölçüm',
}

export const APPOINTMENT_STATUS_LABELS_TR: Record<AppointmentStatus, string> = {
  planlandı: 'Planlandı',
  geldi: 'Geldi',
  gelmedi: 'Gelmedi',
  iptal: 'İptal',
  ertelendi: 'Ertelendi',
}

// calendar-grid.tsx diyetisyen bazlı renk kodu (GÖREV 2) İÇİN sabit bir
// palet — Tailwind sınıf adları BİLEREK tam yazılıyor (dinamik string
// birleştirme, Tailwind'in JIT tarayıcısında ÇALIŞMAZ, bkz. Tailwind
// dokümantasyonu "class detection" bölümü). 8 renk, diyetisyen sayısı bunu
// aşarsa index % 8 ile döngüye girer (bkz. calendar-grid.tsx dietitianColor).
export const DIETITIAN_COLOR_PALETTE = [
  { bg: 'bg-sky-100 dark:bg-sky-950', border: 'border-sky-400', text: 'text-sky-900 dark:text-sky-100' },
  { bg: 'bg-emerald-100 dark:bg-emerald-950', border: 'border-emerald-400', text: 'text-emerald-900 dark:text-emerald-100' },
  { bg: 'bg-amber-100 dark:bg-amber-950', border: 'border-amber-400', text: 'text-amber-900 dark:text-amber-100' },
  { bg: 'bg-violet-100 dark:bg-violet-950', border: 'border-violet-400', text: 'text-violet-900 dark:text-violet-100' },
  { bg: 'bg-rose-100 dark:bg-rose-950', border: 'border-rose-400', text: 'text-rose-900 dark:text-rose-100' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950', border: 'border-cyan-400', text: 'text-cyan-900 dark:text-cyan-100' },
  { bg: 'bg-orange-100 dark:bg-orange-950', border: 'border-orange-400', text: 'text-orange-900 dark:text-orange-100' },
  { bg: 'bg-lime-100 dark:bg-lime-950', border: 'border-lime-400', text: 'text-lime-900 dark:text-lime-100' },
] as const

// ---------------------------------------------------------------------------
// Randevu formu (GÖREV 3) — YYYY-MM-DD + HH:MM <input> tarayıcı formatları,
// client-schemas.ts/measurement-schemas.ts'teki AYNI desen.
// ---------------------------------------------------------------------------

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^\d{2}:\d{2}$/

export const appointmentFormSchema = z
  .object({
    clientId: z.string().trim().min(1, 'Danışan seçilmelidir.'),
    dietitianId: z.string().trim().min(1, 'Diyetisyen seçilmelidir.'),
    date: z.string().regex(isoDatePattern, 'Geçerli bir tarih giriniz.'),
    startTime: z.string().regex(timePattern, 'Geçerli bir saat giriniz.'),
    // Süre dakika cinsinden — bitiş saatini kullanıcıya AYRICA seçtirmek
    // yerine (çoğu randevu sabit sürelerde: 30/45/60 dk) daha az tıklama.
    durationMinutes: z.coerce.number().int().min(5, 'Süre en az 5 dakika olmalıdır.').max(480),
    type: z.enum(['ilk_görüşme', 'kontrol', 'online', 'ölçüm']),
    location: z.string().trim().max(200).optional().or(z.literal('')),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine(
    (value) => {
      const start = new Date(`${value.date}T${value.startTime}:00`)
      return !Number.isNaN(start.getTime())
    },
    { message: 'Geçerli bir tarih/saat kombinasyonu giriniz.', path: ['startTime'] },
  )
export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>

export const APPOINTMENT_DURATION_OPTIONS = [15, 30, 45, 60, 90] as const

// Form değerlerinden gerçek startsAt/endsAt Date çiftini üretir — server
// action (actions.ts) VE hızlı-oluşturma dialog'u (quick-create-dialog.tsx)
// AYNI dönüşümü kullanır, iki yerde tekrarlanmasın diye tek yerde.
export function appointmentFormToDateRange(input: Pick<AppointmentFormInput, 'date' | 'startTime' | 'durationMinutes'>): {
  startsAt: Date
  endsAt: Date
} {
  const startsAt = new Date(`${input.date}T${input.startTime}:00`)
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60 * 1000)
  return { startsAt, endsAt }
}
