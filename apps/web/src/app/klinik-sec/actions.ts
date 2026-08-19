'use server'

import { db } from '@ogun/db'
import { getClinicMembership } from '@ogun/db/queries'
import { requireAuth, setActiveClinic } from '@/lib/authz'

// GitHub issue #67 — /klinik-sec ekranından çağrılır. (app)/actions.ts'teki
// switchClinicAction ile AYNI doğrulamayı yapar (üyelik kontrolü + oturuma
// yazma) ama BİLEREK ayrı bir dosyada: switchClinicAction (app) route
// group'una ait ve o group'un layout'u AKTİF BİR KLİNİK GEREKTİRİYOR —
// klinik seçim ekranı ise tam olarak "henüz aktif klinik YOK" durumunda
// açılır. revalidatePath('/', 'layout') de burada anlamsız olurdu; seçimden
// sonra istemci doğrudan /panel'e gider.
export async function selectClinicAction(
  clinicId: string,
): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAuth()
  const membership = await getClinicMembership(db, clinicId, user.id)
  if (!membership) {
    return { success: false, error: 'Bu kliniğe erişiminiz yok. Klinik yöneticinizden davet isteyin.' }
  }
  await setActiveClinic(clinicId, membership.role)
  return { success: true }
}
