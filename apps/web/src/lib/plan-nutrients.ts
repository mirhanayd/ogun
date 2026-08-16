import {
  NUTRIENT,
  calculateMealNutrients,
  type FoodReference,
  type Meal,
  type MealItem,
} from '@ogun/nutrition-core'
import { getFoodIndexEntriesByIds, type FoodIndexRow } from '@/lib/food-index'

// GitHub issue #25 / Prompt 5.3 — GÖREV 2: "Başlık (düzenlenebilir) + saat +
// öğün toplamı (kcal + makro rozetleri)". Roadmap'in kendi kuralı: "Hesap
// İSTEMCİDE yapılsın (nutrition-core zaten saf TS)... Besin verisi Dexie'den
// okunsun, ağ gecikmesi olmasın" (Prompt 5.4, GÖREV 4 — burada #25 kapsamında
// SADECE meal/day toplamı için ERKEN uygulanıyor, tam panel #26'nın işi).
//
// KURAL: bu dosya nutrition-core'un calculateMealNutrients'ını ÇAĞIRIR,
// PARALEL bir hesap yolu YAZMAZ — tek iş, DB satırlarını (plan_items) +
// Dexie'deki besin öğesi verisini nutrition-core'un beklediği
// Meal/MealItem/FoodReference şekline dönüştürmek.
export interface PlanItemForCalc {
  foodId: string | null
  amountGrams: number
}

export interface MealTotals {
  kcalTotal: number
  proteinGrams: number
  carbGrams: number
  fatGrams: number
  // Kalem serbest metin (freeText/recipeId) olduğu ya da besin öğesi
  // indekste bulunamadığı için hesaba KATILAMAYAN kalem sayısı — sessizce
  // yutulmaz, meal-block.tsx bunu kullanıcıya "N kalem hesaba dahil değil"
  // olarak gösterir (nutrition-core'un warnings kanalıyla AYNI felsefe,
  // bkz. packages/nutrition-core/src/warnings.ts).
  uncalculatedItemCount: number
}

const ZERO_TOTALS: MealTotals = {
  kcalTotal: 0,
  proteinGrams: 0,
  carbGrams: 0,
  fatGrams: 0,
  uncalculatedItemCount: 0,
}

export type FoodMacroLookup = Pick<
  FoodIndexRow,
  'id' | 'nameTr' | 'kcalPer100g' | 'proteinPer100g' | 'carbPer100g' | 'fatPer100g'
>

// SAF fonksiyon — Dexie'ye/İstemci ortamına bağımlı DEĞİL, bu yüzden birim
// testte (bkz. plan-nutrients.test.ts) sahte bir foodLookup Map'iyle
// doğrudan çağrılabilir. calculateMealTotals (aşağıda) bunu Dexie'den okunan
// gerçek veriyle sarmalayan İNCE bir kabuk.
export function computeMealNutrientTotals(
  items: PlanItemForCalc[],
  foodLookup: Map<string, FoodMacroLookup>,
): MealTotals {
  if (items.length === 0) return { ...ZERO_TOTALS }

  const mealItems: MealItem[] = []
  let uncalculatedItemCount = 0

  for (const item of items) {
    const row = item.foodId ? foodLookup.get(item.foodId) : undefined
    if (!row) {
      uncalculatedItemCount += 1
      continue
    }
    const food: FoodReference = {
      id: row.id,
      nameTr: row.nameTr,
      nutrientsPer100g: {
        [NUTRIENT.ENERGY_KCAL]: row.kcalPer100g ?? 0,
        [NUTRIENT.PROTEIN]: row.proteinPer100g ?? 0,
        [NUTRIENT.CARB]: row.carbPer100g ?? 0,
        [NUTRIENT.FAT]: row.fatPer100g ?? 0,
      },
      hasImputedValues: row.kcalPer100g === null || row.proteinPer100g === null,
    }
    mealItems.push({ food, grams: item.amountGrams })
  }

  const meal: Meal = { name: '', items: mealItems }
  const nutrients = calculateMealNutrients(meal)

  return {
    kcalTotal: nutrients[NUTRIENT.ENERGY_KCAL] ?? 0,
    proteinGrams: nutrients[NUTRIENT.PROTEIN] ?? 0,
    carbGrams: nutrients[NUTRIENT.CARB] ?? 0,
    fatGrams: nutrients[NUTRIENT.FAT] ?? 0,
    uncalculatedItemCount,
  }
}

export async function calculateMealTotals(items: PlanItemForCalc[]): Promise<MealTotals> {
  if (items.length === 0) return { ...ZERO_TOTALS }
  const foodIds = [
    ...new Set(items.filter((item) => item.foodId !== null).map((item) => item.foodId as string)),
  ]
  const foodRows = await getFoodIndexEntriesByIds(foodIds)
  return computeMealNutrientTotals(items, foodRows)
}

export function sumMealTotals(totalsList: MealTotals[]): MealTotals {
  return totalsList.reduce<MealTotals>(
    (sum, totals) => ({
      kcalTotal: sum.kcalTotal + totals.kcalTotal,
      proteinGrams: sum.proteinGrams + totals.proteinGrams,
      carbGrams: sum.carbGrams + totals.carbGrams,
      fatGrams: sum.fatGrams + totals.fatGrams,
      uncalculatedItemCount: sum.uncalculatedItemCount + totals.uncalculatedItemCount,
    }),
    { ...ZERO_TOTALS },
  )
}

// GitHub issue #25 — bkz. components/food-search-input.tsx FoodSearchSelection
// üstündeki not: FoodSearchInput'un seçim sonucu bir ev ölçüsü (ör. "1 kase")
// veya birim (ör. "150 gr") içerebilir, ama plan_items.amount HER ZAMAN gram
// olarak yazılır (portionId bilerek null bırakılıyor — gerçek food_portions.id
// eşlemesi FoodSearchHit'te YOK, bu #26/ayrı bir issue'nun kapsamı). Kullanıcının
// yazdığı ev ölçüsü ifadesi, item.note alanına bilgilendirme amaçlı kopyalanır.
export function resolveGramsFromSelection(selection: {
  amount: number
  unit?: 'g' | 'kg' | 'ml' | 'l'
  portion?: string
  defaultPortion: { label: string; grams: number } | null
}): { grams: number; noteHint: string | null } {
  if (selection.unit === 'kg' || selection.unit === 'l') {
    return { grams: selection.amount * 1000, noteHint: null }
  }
  if (selection.unit === 'g' || selection.unit === 'ml') {
    return { grams: selection.amount, noteHint: null }
  }
  if (selection.portion && selection.defaultPortion) {
    return {
      grams: selection.amount * selection.defaultPortion.grams,
      noteHint: `${selection.amount} ${selection.portion}`,
    }
  }
  if (selection.defaultPortion) {
    // Birim/porsiyon hiç yazılmadı (ör. sadece "elma") — besinin varsayılan
    // porsiyonunu "adet" gibi kabul ediyoruz.
    return {
      grams: selection.amount * selection.defaultPortion.grams,
      noteHint: selection.amount !== 1 ? `${selection.amount} adet` : null,
    }
  }
  if (selection.portion) {
    return {
      grams: selection.amount * 100,
      noteHint: `${selection.amount} ${selection.portion} (porsiyon verisi yok, 100g varsayıldı)`,
    }
  }
  return { grams: selection.amount, noteHint: null }
}
