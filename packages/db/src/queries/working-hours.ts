import { eq } from 'drizzle-orm'
import { clinicWorkingHours } from '../schema'
import type { Database } from '../client'

export interface WorkingHourInput {
  // 1 = Pazartesi ... 7 = Pazar — bkz. schema/appointments.ts üstündeki not.
  dayOfWeek: number
  isOpen: boolean
  startTime: string
  endTime: string
}

// Bir kliniğin 7 günlük çalışma saati satırlarını topluca yazar. Tek tek
// upsert (onConflictDoUpdate + "excluded" referansı) yerine bilinçli olarak
// "sil ve yeniden ekle" (transaction içinde) tercih edildi: satır sayısı
// sabit ve küçük (7), ve her adımda TÜM hafta birlikte gönderiliyor —
// bu yüzden kısmi upsert karmaşıklığına gerek yok.
export async function upsertWorkingHours(db: Database, clinicId: string, hours: WorkingHourInput[]) {
  return db.transaction(async (tx) => {
    await tx.delete(clinicWorkingHours).where(eq(clinicWorkingHours.clinicId, clinicId))
    if (hours.length === 0) return []
    return tx
      .insert(clinicWorkingHours)
      .values(hours.map((hour) => ({ clinicId, ...hour })))
      .returning()
  })
}

export async function getWorkingHoursForClinic(db: Database, clinicId: string) {
  return db
    .select()
    .from(clinicWorkingHours)
    .where(eq(clinicWorkingHours.clinicId, clinicId))
    .orderBy(clinicWorkingHours.dayOfWeek)
}
