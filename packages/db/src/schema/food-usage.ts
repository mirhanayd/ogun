// GitHub issue #24 / Prompt 5.2 GÖREV 1 — "son kullanılanlar ve sık
// kullanılanlar en üstte (localStorage değil, sunucuda clinic bazlı tut —
// diyetisyen cihaz değiştirince kaybolmasın)". Böyle bir tablo daha önce
// hiç kurulmadı, bu yüzden burada SIFIRDAN, BİLEREK minimal tutularak
// ekleniyor: bu bir analitik/raporlama tablosu DEĞİL, sadece "bu klinik bu
// besini kaç kez ve en son ne zaman kullandı" sayacı — FoodSearchInput'un
// üst sıralama (recency/frequency ranking) ihtiyacını karşılamaya yetiyor.
// clientId TUTULMUYOR: pinleme klinik geneli (tüm diyetisyenlerin ortak
// "sık kullanılanlar" listesi), danışan bazlı bir öneri sistemi DEĞİL.
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { foods } from './foods'
import { clinics } from './tenancy'
import { id, timestamps } from './_helpers'

export const foodUsage = pgTable(
  'food_usage',
  {
    id: id(),
    clinicId: text('clinic_id')
      .notNull()
      .references(() => clinics.id),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    useCount: integer('use_count').notNull().default(1),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    // Bir (clinic, food) çifti için TEK satır — recordFoodUsage bu üzerinden
    // upsert yapar (bkz. queries/food-usage.ts).
    uniqueIndex('food_usage_clinic_id_food_id_idx').on(table.clinicId, table.foodId),
    index('food_usage_clinic_id_last_used_at_idx').on(table.clinicId, table.lastUsedAt),
    index('food_usage_clinic_id_use_count_idx').on(table.clinicId, table.useCount),
  ],
)
