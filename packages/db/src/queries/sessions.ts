import { eq } from 'drizzle-orm'
import { sessions, type ClinicMemberRole } from '../schema'
import type { Database } from '../client'

// Better Auth session satırındaki activeClinicId/role alanlarını günceller.
// apps/web'in drizzle-orm'a doğrudan bağımlı OLMAMASI (sadece @ogun/db'ye
// bağımlı olması) gerektiği için bu güncelleme burada, sorgu katmanında
// yaşıyor — çağıran taraf (bkz. apps/web/src/lib/authz.ts setActiveClinic)
// sadece bu fonksiyonu çağırır, drizzle operatörleriyle uğraşmaz.
export async function updateSessionActiveClinic(
  db: Database,
  sessionId: string,
  clinicId: string,
  role: ClinicMemberRole,
): Promise<void> {
  await db.update(sessions).set({ activeClinicId: clinicId, role }).where(eq(sessions.id, sessionId))
}
