import { z } from 'zod'

// /kurulum (klinik onboarding) sihirbazında kullanılan Zod şemaları. Hata
// mesajları Türkçe — bkz. apps/web/src/app/kurulum/*. Formlar react-hook-form
// + @hookform/resolvers/zod ile bu şemalara bağlanır, sunucu tarafındaki
// server action'lar da (bkz. app/kurulum/actions.ts) AYNI şemayla tekrar
// doğrular — istemci tarafı doğrulaması atlatılabilir olduğu için.

// ---------------------------------------------------------------------------
// Adım 1 — Klinik adı, telefon, adres
// ---------------------------------------------------------------------------
export const clinicInfoSchema = z.object({
  name: z.string().trim().min(2, 'Klinik adı en az 2 karakter olmalıdır.').max(120, 'Klinik adı en fazla 120 karakter olabilir.'),
  phone: z.string().trim().max(30, 'Telefon numarası çok uzun.').optional().or(z.literal('')),
  address: z.string().trim().max(500, 'Adres çok uzun.').optional().or(z.literal('')),
})
export type ClinicInfoFormValues = z.infer<typeof clinicInfoSchema>

// ---------------------------------------------------------------------------
// Adım 2 — Logo, marka rengi
// ---------------------------------------------------------------------------
// Nesne depolama (S3/MinIO vb.) altyapısı henüz yok (docker-compose.yml'de
// sadece Postgres var) — bu yüzden logo, küçük boyut sınırıyla (bkz.
// MAX_LOGO_BYTES) base64 data URI olarak clinics.logoUrl'e yazılır. Gerçek
// bir nesne depolama servisine taşımak ayrı bir issue kapsamında olmalı;
// diyet listesi PDF çıktısı da (bu alanların asıl kullanım amacı) henüz bu
// issue'nun kapsamında değil.
export const MAX_LOGO_BYTES = 500 * 1024 // 500 KB

const hexColorPattern = /^#[0-9a-fA-F]{6}$/

export const brandingSchema = z.object({
  logoDataUrl: z
    .string()
    .refine((value) => value === '' || value.startsWith('data:image/'), 'Logo geçerli bir görsel dosyası olmalıdır.')
    .optional()
    .or(z.literal('')),
  primaryColor: z
    .string()
    .regex(hexColorPattern, 'Renk #RRGGBB biçiminde olmalıdır.')
    .optional()
    .or(z.literal('')),
})
export type BrandingFormValues = z.infer<typeof brandingSchema>

// ---------------------------------------------------------------------------
// Adım 3 — Çalışma saatleri
// ---------------------------------------------------------------------------
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const workingHourSchema = z
  .object({
    // 1 = Pazartesi ... 7 = Pazar — bkz. packages/db/src/schema/appointments.ts
    dayOfWeek: z.number().int().min(1).max(7),
    isOpen: z.boolean(),
    startTime: z.string().regex(timePattern, 'Saat SS:DD biçiminde olmalıdır.'),
    endTime: z.string().regex(timePattern, 'Saat SS:DD biçiminde olmalıdır.'),
  })
  .refine((hour) => !hour.isOpen || hour.startTime < hour.endTime, {
    message: 'Kapanış saati açılış saatinden sonra olmalıdır.',
    path: ['endTime'],
  })
export type WorkingHourFormValue = z.infer<typeof workingHourSchema>

export const workingHoursSchema = z.object({
  hours: z.array(workingHourSchema).length(7, 'Haftanın 7 günü de gönderilmelidir.'),
})
export type WorkingHoursFormValues = z.infer<typeof workingHoursSchema>

// Sihirbaz formunun (working-hours-step.tsx) KENDİSİ dayOfWeek alanını
// tutmaz — her satırın hangi güne ait olduğu, satırın dizideki index'i ile
// (bkz. lib/onboarding.ts WEEKDAYS_TR) sabittir ve kullanıcı tarafından
// değiştirilemez. Bu yüzden formda ayrı, daha dar bir şema kullanılıyor;
// gönderim anında dayOfWeek eklenip yukarıdaki tam workingHoursSchema'yı
// karşılayan hale getiriliyor (bkz. onSubmit içindeki toWorkingHoursInput).
const workingHourDraftSchema = z
  .object({
    isOpen: z.boolean(),
    startTime: z.string().regex(timePattern, 'Saat SS:DD biçiminde olmalıdır.'),
    endTime: z.string().regex(timePattern, 'Saat SS:DD biçiminde olmalıdır.'),
  })
  .refine((hour) => !hour.isOpen || hour.startTime < hour.endTime, {
    message: 'Kapanış saati açılış saatinden sonra olmalıdır.',
    path: ['endTime'],
  })

export const workingHoursDraftSchema = z.object({
  hours: z.array(workingHourDraftSchema).length(7, 'Haftanın 7 günü de gönderilmelidir.'),
})
export type WorkingHoursDraftValues = z.infer<typeof workingHoursDraftSchema>
