import type { PlanCalculationResult } from './plan'
import { NUTRIENT, type NutrientValuesPer100g } from './types'

export interface MacroDistribution {
  proteinPercent: number
  fatPercent: number
  carbPercent: number
}

// GitHub issue #26 / Prompt 5.4, GÖREV 1 — "hedef aralığı gölgeli
// gösterilsin" isteyen makro dağılım çubuğu için genel kabul görmüş kabul
// edilebilir makro besin öğesi dağılımı (AMDR) aralıkları. TÜBER'e özel
// DEĞİL (tuber-2022.ts'teki yaş grubu referanslarının aksine) — literatürde
// yaygın kullanılan genel yetişkin aralığı, danışana özel değildir.
export const MACRO_DISTRIBUTION_TARGET_RANGES: Record<
  'protein' | 'carb' | 'fat',
  { min: number; max: number }
> = {
  protein: { min: 10, max: 20 },
  carb: { min: 45, max: 65 },
  fat: { min: 20, max: 35 },
}

// Enerjinin protein/yağ/karbonhidrattan gelen yüzdesel dağılımı (4-4-9 Atwater).
export function calculateMacroDistribution(nutrients: NutrientValuesPer100g): MacroDistribution {
  const proteinKcal = (nutrients[NUTRIENT.PROTEIN] ?? 0) * 4
  const fatKcal = (nutrients[NUTRIENT.FAT] ?? 0) * 9
  const carbKcal = (nutrients[NUTRIENT.CARB] ?? 0) * 4
  const totalKcal = proteinKcal + fatKcal + carbKcal

  if (totalKcal === 0) {
    return { proteinPercent: 0, fatPercent: 0, carbPercent: 0 }
  }

  return {
    proteinPercent: (proteinKcal / totalKcal) * 100,
    fatPercent: (fatKcal / totalKcal) * 100,
    carbPercent: (carbKcal / totalKcal) * 100,
  }
}

export interface MealEnergyShare {
  mealName: string
  kcal: number
  percentOfDailyTotal: number
}

// Günlük toplam enerjinin öğünler arasındaki dağılımı.
export function calculateMealEnergyDistribution(plan: PlanCalculationResult): MealEnergyShare[] {
  const totalKcal = plan.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0

  return plan.mealNutrients.map(({ mealName, nutrients }) => {
    const kcal = nutrients[NUTRIENT.ENERGY_KCAL] ?? 0
    return {
      mealName,
      kcal,
      percentOfDailyTotal: totalKcal === 0 ? 0 : (kcal / totalKcal) * 100,
    }
  })
}
