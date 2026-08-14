import { sql } from 'drizzle-orm'
import { foodNutrients } from '@ogun/db/schema'
import type { Database } from '@ogun/db'

export interface FoodNutrientUpsertInput {
  foodId: string
  nutrientId: string
  valuePer100g: string
  sourceId: string
  isImputed: boolean
  note?: string | null
}

// (foodId, nutrientId) çifti için zaten bir değer varsa, yalnızca yeni değerin
// kaynağı eşit veya daha yüksek öncelikliyse üzerine yazar (data_sources.priority).
// Böylece düşük öncelikli bir kaynak, daha güvenilir bir kaynaktan gelen değeri
// yanlışlıkla ezemez.
export async function upsertFoodNutrient(db: Database, input: FoodNutrientUpsertInput) {
  await db
    .insert(foodNutrients)
    .values(input)
    .onConflictDoUpdate({
      target: [foodNutrients.foodId, foodNutrients.nutrientId],
      set: {
        valuePer100g: sql`excluded.value_per_100g`,
        sourceId: sql`excluded.source_id`,
        isImputed: sql`excluded.is_imputed`,
        note: sql`excluded.note`,
      },
      where: sql`
        (select priority from data_sources where id = excluded.source_id)
        >=
        (select priority from data_sources where id = food_nutrients.source_id)
      `,
    })
}
