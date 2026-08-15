import type { Sex } from './energy-requirement'
import type { PlanCalculationResult } from './plan'
import { NUTRIENT } from './types'
import type { DailyPlan } from './types'

export type WarningSeverity = 'info' | 'warning' | 'danger'

export interface NutritionWarning {
  code: string
  severity: WarningSeverity
  message: string
}

// Güvenli minimum günlük kalori (altına inen planlar beslenme yetersizliği
// riski taşır). Kaynak: genel klinik pratik eşiği — TÜBER referansı geldiğinde
// yaş/duruma göre daha ayrıntılı bir eşik tablosuna geçilebilir.
const MIN_SAFE_KCAL: Record<Sex, number> = { male: 1500, female: 1200 }

export function checkMinimumCalorieSafety(dailyKcal: number, sex: Sex): NutritionWarning[] {
  const minKcal = MIN_SAFE_KCAL[sex]
  if (dailyKcal >= minKcal) return []

  return [
    {
      code: 'BELOW_MINIMUM_CALORIE',
      severity: 'danger',
      message: `Günlük ${dailyKcal.toFixed(0)} kcal, güvenli minimum sınırın (${minKcal} kcal, ${
        sex === 'male' ? 'erkek' : 'kadın'
      }) altında.`,
    },
  ]
}

const KCAL_PER_KG_FAT = 7700
const MAX_SAFE_WEEKLY_LOSS_KG = 1

// Günlük enerji açığından tahmini haftalık kilo kaybını hesaplar ve haftada
// 1 kg'dan hızlı kayıp öneriliyorsa uyarır.
export function checkWeeklyWeightLossSafety(dailyDeficitKcal: number): NutritionWarning[] {
  const weeklyLossKg = (dailyDeficitKcal * 7) / KCAL_PER_KG_FAT
  if (weeklyLossKg <= MAX_SAFE_WEEKLY_LOSS_KG) return []

  return [
    {
      code: 'EXCESSIVE_WEEKLY_LOSS',
      severity: 'danger',
      message: `Tahmini haftalık kayıp ${weeklyLossKg.toFixed(2)} kg, güvenli üst sınırı (${MAX_SAFE_WEEKLY_LOSS_KG} kg/hafta) aşıyor.`,
    },
  ]
}

// Planda en az bir besin öğesi değeri tahmini (isImputed) olan besinler için
// bilgilendirme uyarısı üretir.
export function checkImputedDataWarnings(plan: DailyPlan): NutritionWarning[] {
  const warnings: NutritionWarning[] = []
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      if (item.food.hasImputedValues) {
        warnings.push({
          code: 'IMPUTED_DATA',
          severity: 'info',
          message: `"${item.food.nameTr}" için bazı besin öğesi değerleri tahmini (isImputed) — kaynakta doğrudan ölçülmemiş.`,
        })
      }
    }
  }
  return warnings
}

export interface PlanWarningContext {
  sex: Sex
  // Kullanıcı bir kalori açığı (kilo verme) hedefliyorsa: TDEE - plan kcal.
  targetDailyDeficitKcal?: number
}

// Tüm uyarı kontrollerini tek çağrıda çalıştırır.
export function generatePlanWarnings(
  plan: DailyPlan,
  planResult: PlanCalculationResult,
  context: PlanWarningContext,
): NutritionWarning[] {
  const dailyKcal = planResult.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0

  const warnings: NutritionWarning[] = [
    ...checkMinimumCalorieSafety(dailyKcal, context.sex),
    ...checkImputedDataWarnings(plan),
  ]

  if (context.targetDailyDeficitKcal !== undefined) {
    warnings.push(...checkWeeklyWeightLossSafety(context.targetDailyDeficitKcal))
  }

  return warnings
}
