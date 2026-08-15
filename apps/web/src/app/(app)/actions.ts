'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { getClinicMembership } from '@ogun/db/queries'
import { requireAuth, setActiveClinic } from '@/lib/authz'

// Üst bar klinik seçiciden (bkz. _components/clinic-switcher-menu.tsx)
// çağrılır. clinicId'nin kullanıcının gerçekten üyesi olduğu bir klinik
// olduğunu BURADA doğruluyoruz — setActiveClinic() kendisi bunu yapmaz
// (bkz. authz.ts üzerindeki not).
export async function switchClinicAction(clinicId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAuth()
  const membership = await getClinicMembership(db, clinicId, user.id)
  if (!membership) {
    return { success: false, error: 'Bu kliniğe erişiminiz yok.' }
  }
  await setActiveClinic(clinicId, membership.role)
  revalidatePath('/', 'layout')
  return { success: true }
}
