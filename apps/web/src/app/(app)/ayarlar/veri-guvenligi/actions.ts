'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { updateClinicDataRetention } from '@ogun/db/queries'
import { requireRole } from '@/lib/authz'
import {
  dataRetentionSettingSchema,
  type DataRetentionSettingFormValues,
} from '@/lib/validation/compliance-schemas'

// GitHub issue #12 / Prompt 3.3 — GÖREV 4: /ayarlar/veri-guvenligi'nin
// "veri saklama süresi ayarı" bölümü. app/kurulum/actions.ts'teki
// ActionResult örüntüsüyle tutarlı: hata durumunda fırlatmak yerine bir
// sonuç nesnesi döner, form bileşeni bunu formError state'ine yazar.
export interface DataRetentionActionResult {
  success: boolean
  error?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// Sadece owner/dietitian değiştirebilir — /ayarlar nav öğesiyle aynı rol
// kısıtı (bkz. _components/nav-items.ts).
export async function updateDataRetentionAction(
  input: DataRetentionSettingFormValues,
): Promise<DataRetentionActionResult> {
  const parsed = dataRetentionSettingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const { scope } = await requireRole('owner', 'dietitian')
  await updateClinicDataRetention(db, scope.clinicId, parsed.data.dataRetentionDays)
  revalidatePath('/ayarlar/veri-guvenligi')
  return { success: true }
}
