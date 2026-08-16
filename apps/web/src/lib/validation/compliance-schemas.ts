import { z } from 'zod'

// /ayarlar/veri-guvenligi sayfasındaki veri saklama süresi ayarı (GitHub
// issue #12 / Prompt 3.3 — GÖREV 4). Alt sınır (30 gün) danışan silme
// kuyruğunun bekleme süresiyle (bkz. schema/clients.ts
// HARD_DELETE_GRACE_PERIOD_DAYS) tutarlı olsun diye seçildi — bir klinik
// verisini bundan daha kısa süre saklamayı seçerse kalıcı silme kuyruğuyla
// çelişebilir. Üst sınır (100 yıl) sadece saçma değer girişini engellemek
// için, hukuki bir anlamı yok.
export const dataRetentionSettingSchema = z.object({
  dataRetentionDays: z.coerce
    .number({ invalid_type_error: 'Gün sayısı bir sayı olmalıdır.' })
    .int('Gün sayısı tam sayı olmalıdır.')
    .min(30, 'Saklama süresi en az 30 gün olmalıdır.')
    .max(36500, 'Saklama süresi 100 yılı aşamaz.'),
})
export type DataRetentionSettingFormValues = z.infer<typeof dataRetentionSettingSchema>
