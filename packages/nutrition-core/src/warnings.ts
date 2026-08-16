import type { Sex } from './energy-requirement'
import type { PlanCalculationResult } from './plan'
import { calculateMealItemNutrients } from './plan'
import type { AgeGroupReference } from './reference-comparison'
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

// GitHub issue #26 / Prompt 5.4, GÖREV 3 — canlı panelin uyarı mesajlarında
// besin öğesi kodunu Türkçe adıyla göstermek için KÜÇÜK bir yerel sözlük.
// packages/db/src/seed/nutrients.ts'teki TAM listenin bir kopyası DEĞİL —
// nutrition-core DB'ye bağımlı olamayacağı için (paket başı kural), sadece
// bu dosyadaki uyarı mesajlarında GEÇEBİLECEK kodların Türkçe karşılığı
// burada tutuluyor. Listede olmayan bir kod gelirse kodun kendisi gösterilir.
const NUTRIENT_LABELS_TR: Record<string, string> = {
  ENERC_KCAL: 'enerji',
  PROCNT: 'protein',
  CHOCDF: 'karbonhidrat',
  FAT: 'yağ',
  FASAT: 'doymuş yağ',
  FIBTG: 'lif',
  SUGAR: 'şeker',
  NA: 'sodyum',
  FE: 'demir',
  CA: 'kalsiyum',
  ZN: 'çinko',
  VITB12: 'B12 vitamini',
  FOL: 'folat',
  VITD: 'D vitamini',
  VITC: 'C vitamini',
}

function nutrientLabelTr(code: string): string {
  return NUTRIENT_LABELS_TR[code] ?? code
}

// Planda verilen besin öğesi kodları için değeri EKSİK (nutrientsPer100g'da
// hiç yok — 0 DEĞİL, tahmini de değil, doğrudan bilinmiyor) olan kalem
// sayısını sayar ve her kod için ayrı bir bilgilendirme uyarısı üretir.
// "3 kalemde demir verisi yok, toplam eksik olabilir" — spec'in kendi örneği.
export function checkMissingNutrientData(
  plan: DailyPlan,
  nutrientCodes: readonly string[],
): NutritionWarning[] {
  const warnings: NutritionWarning[] = []
  for (const code of nutrientCodes) {
    let missingCount = 0
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        if (!(code in item.food.nutrientsPer100g)) missingCount += 1
      }
    }
    if (missingCount > 0) {
      warnings.push({
        code: 'MISSING_NUTRIENT_DATA',
        severity: 'info',
        message: `${missingCount} kalemde ${nutrientLabelTr(code)} verisi yok, toplam eksik olabilir.`,
      })
    }
  }
  return warnings
}

// Planın enerjisinin ne kadarının tahmini (isImputed) veriye dayandığını
// hesaplar — tek tek besin sayısı değil, KCAL AĞIRLIKLI oran (büyük porsiyonlu
// bir tahmini besin, küçük bir tahmini besinden daha çok "eksik olabilir"
// riski taşır). Eşik AŞILIRSA uyarı üretir.
const IMPUTED_HEAVY_THRESHOLD_PERCENT = 30

export function checkImputedValueHeavy(
  plan: DailyPlan,
  planResult: PlanCalculationResult,
  thresholdPercent = IMPUTED_HEAVY_THRESHOLD_PERCENT,
): NutritionWarning[] {
  const totalKcal = planResult.totalNutrients[NUTRIENT.ENERGY_KCAL] ?? 0
  if (totalKcal <= 0) return []

  let imputedKcal = 0
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      if (!item.food.hasImputedValues) continue
      imputedKcal += calculateMealItemNutrients(item)[NUTRIENT.ENERGY_KCAL] ?? 0
    }
  }

  const imputedPercent = (imputedKcal / totalKcal) * 100
  if (imputedPercent < thresholdPercent) return []

  return [
    {
      code: 'IMPUTED_VALUE_HEAVY',
      severity: 'warning',
      message: `Bu planın %${imputedPercent.toFixed(0)}'i tahmini veriye dayanıyor.`,
    },
  ]
}

// Hedef kaloriyi danışanın yaş/cinsiyet referans aralığıyla (reference.ts'te
// zaten var olan compareToReference'ın AYNI AgeGroupReference girdisi)
// karşılaştırır — reference.ranges'daki ENERC_KCAL aralığının dışındaysa
// (yaş/duruma göre türetilen aralık, sabit bir global eşik DEĞİL) belirgin
// bir uyarı üretir. checkMinimumCalorieSafety'nin (sabit MIN_SAFE_KCAL)
// AKSİNE, burası danışana özel referansı kullanır.
export function checkUnsafeEnergyTarget(
  targetKcal: number | null,
  reference: AgeGroupReference | null,
): NutritionWarning[] {
  if (targetKcal === null || reference === null) return []
  const range = reference.ranges.find((r) => r.nutrientCode === NUTRIENT.ENERGY_KCAL)
  if (!range) return []

  if (range.min !== null && targetKcal < range.min) {
    return [
      {
        code: 'UNSAFE_ENERGY_TARGET',
        severity: 'danger',
        message: `Hedef kalori (${targetKcal.toFixed(0)} kcal), danışanın referans aralığının (min ${range.min} kcal) altında — güvenli olmayabilir.`,
      },
    ]
  }
  if (range.max !== null && targetKcal > range.max) {
    return [
      {
        code: 'UNSAFE_ENERGY_TARGET',
        severity: 'danger',
        message: `Hedef kalori (${targetKcal.toFixed(0)} kcal), danışanın referans aralığının (maks ${range.max} kcal) üstünde — güvenli olmayabilir.`,
      },
    ]
  }
  return []
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

export interface LiveWarningContext {
  targetKcal: number | null
  reference: AgeGroupReference | null
  coreNutrientCodes: readonly string[]
}

// GitHub issue #26 / Prompt 5.4, GÖREV 3 — plan editörünün canlı besin öğesi
// panelinin gösterdiği TÜM uyarı kanalını tek çağrıda toplar: eksik veri
// (MISSING_NUTRIENT_DATA), ağır tahmini veri oranı (IMPUTED_VALUE_HEAVY) ve
// güvenli olmayan enerji hedefi (UNSAFE_ENERGY_TARGET). generatePlanWarnings
// (yukarıda) BİLEREK değiştirilmedi — o, sabit MIN_SAFE_KCAL eşiğine dayanan
// KENDİ çağıranları (bkz. goal-projection.ts, etl/e2e-plan-validation.ts) için
// olduğu gibi kalıyor; bu panel danışana özel referans aralığı kullanıyor.
export function generateLiveNutrientWarnings(
  plan: DailyPlan,
  planResult: PlanCalculationResult,
  context: LiveWarningContext,
): NutritionWarning[] {
  return [
    ...checkMissingNutrientData(plan, context.coreNutrientCodes),
    ...checkImputedValueHeavy(plan, planResult),
    ...checkUnsafeEnergyTarget(context.targetKcal, context.reference),
  ]
}
