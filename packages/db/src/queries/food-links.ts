import { and, eq, or } from 'drizzle-orm'
import { foodLinks, foods } from '../schema'
import type { Database } from '../client'

export interface LinkFoodsInput {
  foodIdA: string
  foodIdB: string
  method: string
  confidence?: number
}

// BLS ve USDA gibi farklı kaynaklardaki aynı besini elle birbirine bağlar.
// OTOMATİK EŞLEŞTİRME YOK — bu fonksiyon her zaman bir insan (veya ileride
// insan onaylı bir öneri akışı) tarafından çağrılmalı.
//
// (foodIdA, foodIdB) çifti daima küçük id önce gelecek şekilde normalize edilir,
// böylece linkFoods(x, y) ile linkFoods(y, x) aynı satıra karşılık gelir.
export async function linkFoods(db: Database, input: LinkFoodsInput) {
  const sorted = [input.foodIdA, input.foodIdB].sort() as [string, string]
  const [foodIdA, foodIdB] = sorted
  if (foodIdA === foodIdB) {
    throw new Error('Bir besin kendisiyle eşleştirilemez.')
  }

  const values = {
    foodIdA,
    foodIdB,
    method: input.method,
    ...(input.confidence !== undefined ? { confidence: input.confidence.toString() } : {}),
  }

  const [link] = await db
    .insert(foodLinks)
    .values(values)
    .onConflictDoUpdate({
      target: [foodLinks.foodIdA, foodLinks.foodIdB],
      set: values,
    })
    .returning()

  return link
}

export async function unlinkFoods(db: Database, foodIdA: string, foodIdB: string) {
  const [a, b] = [foodIdA, foodIdB].sort()
  await db.delete(foodLinks).where(and(eq(foodLinks.foodIdA, a!), eq(foodLinks.foodIdB, b!)))
}

// Bir besine bağlı tüm eşleşmeleri, karşı taraftaki besinin temel bilgisiyle döner.
export async function listFoodLinks(db: Database, foodId: string) {
  const rows = await db
    .select({
      linkId: foodLinks.id,
      foodIdA: foodLinks.foodIdA,
      foodIdB: foodLinks.foodIdB,
      confidence: foodLinks.confidence,
      method: foodLinks.method,
      createdAt: foodLinks.createdAt,
    })
    .from(foodLinks)
    .where(or(eq(foodLinks.foodIdA, foodId), eq(foodLinks.foodIdB, foodId)))

  const linkedFoodIds = rows.map((row) => (row.foodIdA === foodId ? row.foodIdB : row.foodIdA))
  if (linkedFoodIds.length === 0) return []

  const linkedFoods = await db.select().from(foods).where(or(...linkedFoodIds.map((id) => eq(foods.id, id))))
  const linkedFoodById = new Map(linkedFoods.map((food) => [food.id, food]))

  return rows.map((row) => {
    const linkedFoodId = row.foodIdA === foodId ? row.foodIdB : row.foodIdA
    return {
      linkId: row.linkId,
      confidence: row.confidence,
      method: row.method,
      createdAt: row.createdAt,
      linkedFood: linkedFoodById.get(linkedFoodId) ?? null,
    }
  })
}
