import { inArray } from 'drizzle-orm'
import { recipes } from '../schema/recipes'
import type { Database } from '../client'

// GitHub issue #35 / Prompt 6.1 — PDF üretiminin bir plan kalemi tarif
// (recipeId dolu) olduğunda gösterdiği adı çözmek için minimal bir sorgu.
// KAPSAM SINIRI: tarifin besin öğesi katkısını (kcal/makro) HESAPLAMAZ —
// bu, #26'nın canlı besin öğesi paneli (bkz. apps/web/src/lib/
// plan-live-panel.ts toCalcMeals) için de AYNI şekilde eksik; plan editörü
// şu an tarif kalemlerini sadece "Tarif" placeholder'ıyla gösteriyor (bkz.
// plan-item-row.tsx). PDF de aynı sınırı miras alıyor — tarif nutrient
// hesaplaması (cooking.ts'in verim/pişirme faktörleriyle birlikte)
// nutrient panelinde de henüz YOK, bu issue'nun kapsamı DIŞINDA bir gap
// olduğu PR açıklamasında ayrıca not düşüldü.
export async function getRecipeNamesByIds(
  db: Database,
  recipeIds: string[],
): Promise<Map<string, string>> {
  if (recipeIds.length === 0) return new Map()
  const rows = await db
    .select({ id: recipes.id, nameTr: recipes.nameTr })
    .from(recipes)
    .where(inArray(recipes.id, recipeIds))
  return new Map(rows.map((r) => [r.id, r.nameTr]))
}
