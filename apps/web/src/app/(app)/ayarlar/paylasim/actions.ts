'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { updateClinicWhatsappTemplate } from '@ogun/db/queries'
import { requireRole } from '@/lib/authz'
import {
  whatsappTemplateSettingSchema,
  type WhatsappTemplateSettingFormValues,
} from '@/lib/validation/share-schemas'

// GitHub issue #36 / Prompt 6.2, GÖREV 2 — /ayarlar/paylasim'ın WhatsApp
// mesaj şablonu formu. veri-guvenligi/actions.ts'teki
// updateDataRetentionAction ile AYNI desen (fırlatmak yerine ActionResult).
export interface ShareSettingsActionResult {
  success: boolean
  error?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// Klinik-geneli paylaşım şablonu yalnız yönetici tarafından değiştirilebilir.
export async function updateWhatsappTemplateAction(
  input: WhatsappTemplateSettingFormValues,
): Promise<ShareSettingsActionResult> {
  const parsed = whatsappTemplateSettingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const { scope } = await requireRole('owner')
  // Boş metin -> NULL (varsayılana dön), bkz. schema/tenancy.ts
  // whatsappMessageTemplate notu.
  const trimmed = parsed.data.whatsappMessageTemplate.trim()
  await updateClinicWhatsappTemplate(db, scope.clinicId, trimmed.length > 0 ? trimmed : null)
  revalidatePath('/ayarlar/paylasim')
  return { success: true }
}
