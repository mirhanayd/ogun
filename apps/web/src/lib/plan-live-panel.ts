import {
  calculateMacroDistribution,
  calculateMealEnergyDistribution,
  calculatePlan,
  classifyNutrientLevel,
  generateLiveNutrientWarnings,
  type AgeGroupReference,
  type DailyPlan,
  type Meal,
  type MealEnergyShare,
  type MacroDistribution,
  type MealItem,
  type NutritionWarning,
  type NutrientLevelResult,
  type NutrientValuesPer100g,
  type PlanCalculationResult,
} from '@ogun/nutrition-core'
import type { FoodIndexRow } from './food-index'
import type { DraftDay } from '@/app/(app)/danisanlar/[id]/planlar/[planId]/plan-editor-store'

// GitHub issue #26 / Prompt 5.4 — plan editörünün canlı besin öğesi
// panelinin TEK giriş noktası. Roadmap'in kuralı: "Hesap İSTEMCİDE
// yapılsın (nutrition-core zaten saf TS)" — bu dosya nutrition-core'un
// calculatePlan/calculateMacroDistribution/calculateMealEnergyDistribution/
// classifyNutrientLevel/generateLiveNutrientWarnings fonksiyonlarını
// ÇAĞIRIR, PARALEL bir hesap yolu YAZMAZ (plan-nutrients.ts dosya başı
// notundaki AYNI kural). Tek iş: DraftDay[] (Zustand taslağı) + Dexie'deki
// besin öğesi haritasını nutrition-core'un DailyPlan/Meal/MealItem şekline
// dönüştürmek.
export type FoodNutrientLookup = Pick<
  FoodIndexRow,
  'id' | 'nameTr' | 'nutrientsPer100g' | 'hasImputedValues'
>

function toCalcMeals(
  days: DraftDay[],
  foodLookup: Map<string, FoodNutrientLookup>,
): { meals: Meal[]; dayCount: number } {
  const dayCount = Math.max(days.length, 1)
  const meals: Meal[] = []

  for (const day of days) {
    for (const meal of day.meals) {
      const items: MealItem[] = []
      for (const item of meal.items) {
        const food = item.foodId ? foodLookup.get(item.foodId) : undefined
        // Serbest metin/tarif kalemleri veya henüz Dexie'de çözülmemiş
        // besinler İÇİN plan-nutrients.ts'teki uncalculatedItemCount ile
        // AYNI felsefe: sessizce yutmuyoruz ama hesaba da katamıyoruz —
        // panel bunu warnings[] (MISSING_NUTRIENT_DATA benzeri) ve öğün
        // bloğunun kendi rozetiyle (bkz. meal-block.tsx) zaten gösteriyor.
        if (!food) continue
        items.push({
          food: {
            id: food.id,
            nameTr: food.nameTr,
            nutrientsPer100g: food.nutrientsPer100g,
            hasImputedValues: food.hasImputedValues,
          },
          grams: item.amountGrams,
        })
      }
      // Çok günlük planlarda öğün adları günü de taşır (ör. "Gün 2 —
      // Kahvaltı") — aksi halde calculatePlan'ın mealNutrients dizisinde
      // aynı isimli birden fazla öğün ayırt edilemez hale gelirdi.
      const mealLabel =
        days.length > 1 ? `${day.dayLabel ?? `Gün ${day.dayNumber}`} — ${meal.name}` : meal.name
      meals.push({ name: mealLabel, items })
    }
  }

  return { meals, dayCount }
}

function divideNutrients(nutrients: NutrientValuesPer100g, divisor: number): NutrientValuesPer100g {
  const result: NutrientValuesPer100g = {}
  for (const [code, value] of Object.entries(nutrients)) {
    result[code] = value / divisor
  }
  return result
}

// Çok günlük planlarda TÜBER referansları GÜNLÜK olduğu için toplam/öğün
// değerleri gün sayısına bölünerek "ortalama gün"e indirgenir. Tek günlük
// planlarda (çoğunluk) bu no-op'tur.
function averagePlanResult(result: PlanCalculationResult, dayCount: number): PlanCalculationResult {
  if (dayCount <= 1) return result
  return {
    totalNutrients: divideNutrients(result.totalNutrients, dayCount),
    mealNutrients: result.mealNutrients.map((meal) => ({
      mealName: meal.mealName,
      nutrients: divideNutrients(meal.nutrients, dayCount),
    })),
  }
}

export interface LivePanelInput {
  days: DraftDay[]
  foodLookup: Map<string, FoodNutrientLookup>
  targetKcal: number | null
  reference: AgeGroupReference | null
  coreNutrientCodes: readonly string[]
}

export interface LivePanelData {
  totalNutrients: NutrientValuesPer100g
  macroDistribution: MacroDistribution
  mealEnergyShares: MealEnergyShare[]
  // Referans yoksa (danışanda yaş/cinsiyet bilgisi eksikse) boş dizi döner —
  // panel bunu ayrı bir bilgilendirme olarak gösterir (bkz. nutrient-panel.tsx).
  nutrientLevels: NutrientLevelResult[]
  warnings: NutritionWarning[]
  // Çok günlük bir plan mı (>1) — panelde "günlük ortalama" notunu göstermek için.
  dayCount: number
}

// SAF fonksiyon — Dexie'ye bağımlı değil (birim testte sahte bir foodLookup
// Map'iyle çağrılabilir, bkz. plan-live-panel.test.ts). nutrient-panel.tsx
// bunu SADECE Dexie'den okunan gerçek veriyle sarmalayan ince bir kabuk.
export function buildLivePanelData(input: LivePanelInput): LivePanelData {
  const { meals, dayCount } = toCalcMeals(input.days, input.foodLookup)
  const dailyPlan: DailyPlan = { meals }
  const rawResult = calculatePlan(dailyPlan)
  const displayResult = averagePlanResult(rawResult, dayCount)

  const macroDistribution = calculateMacroDistribution(displayResult.totalNutrients)
  const mealEnergyShares = calculateMealEnergyDistribution(displayResult)
  const nutrientLevels = input.reference
    ? classifyNutrientLevel(displayResult.totalNutrients, input.reference)
    : []

  // Uyarılar HAM (bölünmemiş) plan/sonuç üzerinden hesaplanır — kalem sayısı
  // (MISSING_NUTRIENT_DATA) ve kcal-ağırlıklı oran (IMPUTED_VALUE_HEAVY) gün
  // sayısına bölmekle DEĞİŞMEZ (oran zaten normalize), ama ham kalem sayımı
  // daha doğru bir "N kalemde eksik" mesajı verir.
  const warnings = generateLiveNutrientWarnings(dailyPlan, rawResult, {
    targetKcal: input.targetKcal,
    reference: input.reference,
    coreNutrientCodes: input.coreNutrientCodes,
  })

  return {
    totalNutrients: displayResult.totalNutrients,
    macroDistribution,
    mealEnergyShares,
    nutrientLevels,
    warnings,
    dayCount,
  }
}
