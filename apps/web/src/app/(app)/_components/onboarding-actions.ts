'use server'

import { db } from '@ogun/db'
import { markProductTourCompleted } from '@ogun/db/queries'
import { requireAuth } from '@/lib/authz'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "İlk girişte 4 adımlı ürün turu".
// requireAuth() (requireClinic DEĞİL) kullanılıyor çünkü tur tamamlama
// kullanıcı bazlı (bkz. schema/tenancy.ts users.productTourCompletedAt
// üstündeki not) — bir klinik bağlamı gerektirmiyor.
export async function completeProductTourAction(): Promise<void> {
  const ctx = await requireAuth()
  await markProductTourCompleted(db, ctx.user.id)
}
