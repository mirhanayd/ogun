import { desc, eq, sql } from 'drizzle-orm'
import { foodUsage } from '../schema/food-usage'
import { foods } from '../schema/foods'
import type { Database } from '../client'

// GitHub issue #24 / Prompt 5.2 GÖREV 1 — bir besin plan kalemine eklendiğinde
// (veya FoodSearchInput sonuçlarından seçildiğinde) çağrılır. Aynı
// (clinicId, foodId) çifti için sayaç artar, lastUsedAt "şimdi"ye güncellenir.
export async function recordFoodUsage(db: Database, clinicId: string, foodId: string): Promise<void> {
  await db
    .insert(foodUsage)
    .values({ clinicId, foodId, useCount: 1, lastUsedAt: new Date() })
    .onConflictDoUpdate({
      target: [foodUsage.clinicId, foodUsage.foodId],
      set: { useCount: sql`${foodUsage.useCount} + 1`, lastUsedAt: new Date() },
    })
}

export interface PinnedFoodUsage {
  foodId: string
  nameTr: string
  groupNameTr: string | null
  useCount: number
  lastUsedAt: Date
}

// FoodSearchInput'un boş sorguda üstte göstereceği "son kullanılanlar ve sık
// kullanılanlar" listesi. İki ayrı sıralama (recency, frequency) alınıp
// tekilleştirilerek birleştirilir — recency önce eklendiği için eşit
// popülerlikte "en son kullanılan" öne çıkar. `limit` NİHAİ liste
// uzunluğüdür (her iki alt sorgu da bu kadarını çeker, üst sınır tutması
// için 2 katı istenir).
export async function getPinnedFoodUsage(db: Database, clinicId: string, limit = 8): Promise<PinnedFoodUsage[]> {
  const fetchLimit = limit * 2

  const [recentRows, frequentRows] = await Promise.all([
    db
      .select({
        foodId: foodUsage.foodId,
        nameTr: foods.nameTr,
        groupNameTr: foods.groupNameTr,
        useCount: foodUsage.useCount,
        lastUsedAt: foodUsage.lastUsedAt,
      })
      .from(foodUsage)
      .innerJoin(foods, eq(foods.id, foodUsage.foodId))
      .where(eq(foodUsage.clinicId, clinicId))
      .orderBy(desc(foodUsage.lastUsedAt))
      .limit(fetchLimit),
    db
      .select({
        foodId: foodUsage.foodId,
        nameTr: foods.nameTr,
        groupNameTr: foods.groupNameTr,
        useCount: foodUsage.useCount,
        lastUsedAt: foodUsage.lastUsedAt,
      })
      .from(foodUsage)
      .innerJoin(foods, eq(foods.id, foodUsage.foodId))
      .where(eq(foodUsage.clinicId, clinicId))
      .orderBy(desc(foodUsage.useCount))
      .limit(fetchLimit),
  ])

  const seen = new Set<string>()
  const merged: PinnedFoodUsage[] = []
  for (const row of [...recentRows, ...frequentRows]) {
    if (seen.has(row.foodId)) continue
    seen.add(row.foodId)
    merged.push(row)
    if (merged.length >= limit) break
  }
  return merged
}

// Test/temizlik yardımcısı — plans.test.ts'teki afterAll deseniyle aynı
// gerekçeyle (fixture'ları geri almak) round-trip testlerinde kullanılabilir.
export async function clearFoodUsageForClinic(db: Database, clinicId: string): Promise<void> {
  await db.delete(foodUsage).where(eq(foodUsage.clinicId, clinicId))
}
