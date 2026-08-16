import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  dietPlans,
  planDays,
  planItems,
  planMeals,
  savedMealItems,
  savedMeals,
  type PlanMealType,
} from '../schema'
import type { Database } from '../client'

// GitHub issue #27 / Prompt 5.5, GÖREV 3 — öğün blokları kütüphanesi sorgu
// katmanı. packages/db/src/queries/plans.ts'teki AYNI desen: düz bir
// `clinicId: string` alır, HER yazma/okuma clinicId üzerinden filtrelenir.
// saved_meal_items'ın kendi clinicId sütunu YOK (plan_items'ın plan_meals/
// plan_days/diet_plans zincirinden dolaylı scope etmesiyle AYNI gerekçe) —
// ama burada zincir daha kısa: saved_meal_items -> saved_meals.clinicId.

async function assertSavedMealInClinic(
  db: Database,
  clinicId: string,
  savedMealId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(and(eq(savedMeals.id, savedMealId), eq(savedMeals.clinicId, clinicId)))
    .limit(1)
  if (!row) throw new Error('Kayıtlı öğün bulunamadı.')
}

// plan_meals.id -> plan_days -> diet_plans zinciriyle, ilgili öğünün bu
// klinikte olduğunu doğrular — queries/plans.ts getMealWithClinicCheck ile
// AYNI join deseni (o fonksiyon private olduğu için burada tekrar ediliyor,
// tıpkı health-records.ts / measurements.ts arasındaki tekrarlar gibi).
async function getMealWithItemsForClinic(db: Database, clinicId: string, mealId: string) {
  const [row] = await db
    .select({ meal: planMeals })
    .from(planMeals)
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planMeals.id, mealId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  if (!row) return null

  const items = await db
    .select()
    .from(planItems)
    .where(eq(planItems.mealId, mealId))
    .orderBy(asc(planItems.sortOrder))

  return { meal: row.meal, items }
}

// --- kaydet: bir plan öğününü saved_meal'e kopyalar -------------------------

export interface CreateSavedMealFromMealInput {
  mealId: string
  name: string
  notes?: string | null
}

// GÖREV 3 — "öğün bloğunda 'kaydet' ikonu": kaynak öğünün TÜM kalemlerini
// (foodId/recipeId/freeText + amount + portionId) tek bir transaction'da
// saved_meal_items'a kopyalar. Alternatifler BİLEREK taşınmıyor (bkz.
// schema/saved-meals.ts dosya başı notu).
export async function createSavedMealFromMeal(
  db: Database,
  clinicId: string,
  createdBy: string,
  input: CreateSavedMealFromMealInput,
) {
  const found = await getMealWithItemsForClinic(db, clinicId, input.mealId)
  if (!found) throw new Error('Öğün bulunamadı.')
  if (found.items.length === 0) {
    throw new Error('Boş bir öğün kaydedilemez, önce en az bir kalem ekleyin.')
  }

  return db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(savedMeals)
      .values({
        clinicId,
        mealType: found.meal.mealType,
        name: input.name,
        notes: input.notes ?? null,
        createdBy,
      })
      .returning()
    if (!saved) throw new Error('Öğün kaydedilemedi.')

    await tx.insert(savedMealItems).values(
      found.items.map((item) => ({
        savedMealId: saved.id,
        foodId: item.foodId,
        recipeId: item.recipeId,
        freeText: item.freeText,
        amount: item.amount,
        portionId: item.portionId,
        sortOrder: item.sortOrder,
        isOptional: item.isOptional,
        note: item.note,
      })),
    )

    return saved
  })
}

// --- liste / okuma -----------------------------------------------------------

export interface SavedMealSummary {
  id: string
  name: string
  mealType: PlanMealType
  notes: string | null
  itemCount: number
  createdAt: Date
}

export async function listSavedMeals(
  db: Database,
  clinicId: string,
  mealType?: PlanMealType,
): Promise<SavedMealSummary[]> {
  const conditions = [eq(savedMeals.clinicId, clinicId)]
  if (mealType) conditions.push(eq(savedMeals.mealType, mealType))

  const rows = await db
    .select()
    .from(savedMeals)
    .where(and(...conditions))
    .orderBy(asc(savedMeals.name))

  if (rows.length === 0) return []

  const items = await db
    .select({ savedMealId: savedMealItems.savedMealId })
    .from(savedMealItems)
    .where(
      inArray(
        savedMealItems.savedMealId,
        rows.map((r) => r.id),
      ),
    )
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.savedMealId, (counts.get(item.savedMealId) ?? 0) + 1)
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mealType: row.mealType,
    notes: row.notes,
    itemCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
  }))
}

export async function deleteSavedMeal(db: Database, clinicId: string, savedMealId: string) {
  await assertSavedMealInClinic(db, clinicId, savedMealId)
  return db.transaction(async (tx) => {
    await tx.delete(savedMealItems).where(eq(savedMealItems.savedMealId, savedMealId))
    const [deleted] = await tx.delete(savedMeals).where(eq(savedMeals.id, savedMealId)).returning()
    return deleted ?? null
  })
}

// --- "@" tetikleyicisi: kayıtlı öğünü bir plan öğününe geri ekler -----------

// GÖREV 3 — "arama kutusunda '@' ile çağır". saved_meal_items'ı hedef
// plan_meals'a plan_items olarak kopyalar — clonePlanInternal'ın (bkz.
// queries/plans.ts) items döngüsüyle AYNI mantık, ama tek bir öğün
// seviyesinde ve tersi yönde (saved_meal -> plan_item). sortOrder, hedef
// öğündeki MEVCUT kalemlerin ardından devam eder (üzerine YAZMAZ).
export async function insertSavedMealIntoMeal(
  db: Database,
  clinicId: string,
  targetMealId: string,
  savedMealId: string,
) {
  await assertSavedMealInClinic(db, clinicId, savedMealId)
  const targetMeal = await getMealWithItemsForClinic(db, clinicId, targetMealId)
  if (!targetMeal) throw new Error('Hedef öğün bulunamadı.')

  const sourceItems = await db
    .select()
    .from(savedMealItems)
    .where(eq(savedMealItems.savedMealId, savedMealId))
    .orderBy(asc(savedMealItems.sortOrder))
  if (sourceItems.length === 0) {
    throw new Error('Bu kayıtlı öğünde hiç kalem yok.')
  }

  const startOrder = targetMeal.items.length

  return db.transaction(async (tx) => {
    const inserted = []
    for (const [index, sourceItem] of sourceItems.entries()) {
      const [item] = await tx
        .insert(planItems)
        .values({
          mealId: targetMealId,
          foodId: sourceItem.foodId,
          recipeId: sourceItem.recipeId,
          freeText: sourceItem.freeText,
          amount: sourceItem.amount,
          portionId: sourceItem.portionId,
          sortOrder: startOrder + index,
          isOptional: sourceItem.isOptional,
          note: sourceItem.note,
        })
        .returning()
      if (!item) throw new Error('Kalem eklenemedi.')
      inserted.push(item)
    }
    return inserted
  })
}
