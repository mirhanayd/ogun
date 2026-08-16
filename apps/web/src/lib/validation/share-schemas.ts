import { z } from 'zod'

// /ayarlar/paylasim sayfasındaki WhatsApp mesaj şablonu ayarı (GitHub issue
// #36 / Prompt 6.2, GÖREV 2). compliance-schemas.ts'teki
// dataRetentionSettingSchema ile AYNI desen: tek alanlı, boş bırakılırsa
// (trim sonrası "") varsayılana (DEFAULT_WHATSAPP_TEMPLATE) döner — DB'de
// NULL olarak saklanır (bkz. share-actions.ts updateWhatsappTemplateAction).
export const whatsappTemplateSettingSchema = z.object({
  whatsappMessageTemplate: z
    .string()
    .max(2000, 'Mesaj şablonu 2000 karakteri aşamaz.'),
})
export type WhatsappTemplateSettingFormValues = z.infer<typeof whatsappTemplateSettingSchema>

// Paylaşım diyaloğundaki "e-posta ile gönder" alanı.
export const sendPlanShareEmailSchema = z.object({
  recipientEmail: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
})
export type SendPlanShareEmailFormValues = z.infer<typeof sendPlanShareEmailSchema>
