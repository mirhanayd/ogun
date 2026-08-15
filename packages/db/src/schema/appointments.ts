// Randevu şeması — appointments, clinic_holidays (ileride, randevu modülü
// kapsamında — bkz. HAFTA 5+ yol haritası). clinic_working_hours BURADA,
// Prompt 3.2 (Onboarding ve uygulama kabuğu, GitHub issue #11) kapsamında
// eklendi çünkü onboarding'in 3. adımı (çalışma saatleri) bu tabloyu yazıyor;
// asıl randevu modülü bu tabloyu okuyup müsaitlik hesaplamak için kullanacak.
import { boolean, integer, pgTable, text, time, uniqueIndex } from 'drizzle-orm/pg-core'
import { clinics } from './tenancy'
import { id, timestamps } from './_helpers'

// dayOfWeek: ISO 8601 hafta günü — 1 = Pazartesi ... 7 = Pazar. DİKKAT:
// JavaScript'in Date.prototype.getDay() değeriyle (0 = Pazar ... 6 = Cumartesi)
// KARIŞTIRILMAMALI. getDay() değerinden dönüşüm gerekiyorsa: ((getDay() + 6) % 7) + 1.
//
// Klinik başına her gün için TEK satır olur (uniqueIndex clinicId+dayOfWeek) —
// isOpen=false ise o gün kapalı demektir, startTime/endTime yine de dolu
// tutulur (varsayılan bir aralık göstermek için) ama randevu modülü isOpen'a bakar.
export const clinicWorkingHours = pgTable(
  'clinic_working_hours',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    ...timestamps(),
  },
  (table) => [uniqueIndex('clinic_working_hours_clinic_id_day_of_week_idx').on(table.clinicId, table.dayOfWeek)],
)
