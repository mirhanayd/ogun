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

export async function upsertFoodNutrient(db: Database, input: FoodNutrientUpsertInput) {
  await upsertFoodNutrients(db, [input])
}

// food_nutrients artık (foodId, nutrientId, sourceId) bileşik anahtarına sahip —
// aynı besin öğesi için birden fazla kaynağın değeri YAN YANA durur, kaybeden
// SİLİNMEZ. Burada sadece "bu kaynak, bu besin+besin öğesi için değerini
// yazıyor/güncelliyor" işlemi yapılır (ör. bir içe aktarmanın tekrar çalıştırılması).
// Hangi kaynağın öncelikli (isPreferred) sayılacağına src/lib/merge.ts karar verir —
// bu fonksiyon isPreferred'a dokunmaz.
//
// Aynı SQL ifadesiyle birden fazla satırı tek round-trip'te yazar. Büyük
// içe aktarmalarda (BLS: ~7.000 besin × ~56 besin öğesi) satır başına ayrı
// bir sorgu atmak yavaş olur; bir besinin tüm besin öğesi değerlerini tek
// seferde göndermek performansı büyük ölçüde artırır.
export async function upsertFoodNutrients(db: Database, inputs: FoodNutrientUpsertInput[]) {
  if (inputs.length === 0) return
  await db
    .insert(foodNutrients)
    .values(inputs)
    .onConflictDoUpdate({
      target: [foodNutrients.foodId, foodNutrients.nutrientId, foodNutrients.sourceId],
      set: {
        valuePer100g: sql`excluded.value_per_100g`,
        isImputed: sql`excluded.is_imputed`,
        note: sql`excluded.note`,
      },
    })
}
