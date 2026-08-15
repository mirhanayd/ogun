import { sql } from 'drizzle-orm'
import type { Database } from '@ogun/db'

// Her (foodId, nutrientId) grubunda data_sources.priority'si en yüksek olan
// satırı isPreferred=true, diğerlerini false yapar. Kaybeden satırlar veritabanında
// kalmaya devam eder (bkz. packages/db/src/schema/foods.ts > foodNutrients yorumu) —
// bu sadece "hangisi aktif kullanılsın" işaretlemesi, silme değil.
//
// Herhangi bir importer çalıştırıldıktan sonra (BLS, USDA, ileride TÜRKOMP/OFF)
// çağrılmalı. Tüm tabloyu tek UPDATE'te yeniden hesapladığı için idempotent'tir
// ve tekrar tekrar çalıştırılabilir.
export async function resolvePreferredSources(db: Database) {
  await db.execute(sql`
    WITH ranked AS (
      SELECT
        fn.food_id,
        fn.nutrient_id,
        fn.source_id,
        ROW_NUMBER() OVER (
          PARTITION BY fn.food_id, fn.nutrient_id
          ORDER BY ds.priority DESC
        ) AS rn
      FROM food_nutrients fn
      JOIN data_sources ds ON ds.id = fn.source_id
    )
    UPDATE food_nutrients fn
    SET is_preferred = (ranked.rn = 1)
    FROM ranked
    WHERE fn.food_id = ranked.food_id
      AND fn.nutrient_id = ranked.nutrient_id
      AND fn.source_id = ranked.source_id
      AND fn.is_preferred IS DISTINCT FROM (ranked.rn = 1)
  `)
}
