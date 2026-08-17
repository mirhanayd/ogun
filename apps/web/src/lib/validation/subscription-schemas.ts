import { z } from 'zod'

// GitHub issue #41 / Prompt 7.3 — /ayarlar/abonelik. share-schemas.ts
// whatsappTemplateSettingSchema ile AYNI desen.
export const smsTemplateSettingSchema = z.object({
  smsReminderTemplate: z.string().max(480, 'Mesaj şablonu 480 karakteri aşamaz.'),
})
export type SmsTemplateSettingFormValues = z.infer<typeof smsTemplateSettingSchema>

// Plan seçimi — değerler BİLEREK zod şemasından TÜRETİLMİYOR
// (client-schemas.ts SEX_OPTIONS ile AYNI gerekçe: drizzle-orm'u istemci
// paketine sürüklememek için).
export const selectSubscriptionPlanSchema = z.object({
  planCode: z.enum(['başlangıç', 'klinik', 'kurumsal']),
})
export type SelectSubscriptionPlanFormValues = z.infer<typeof selectSubscriptionPlanSchema>
