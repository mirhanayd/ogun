import { describe, expect, it } from 'vitest'
import {
  checkImputedDataWarnings,
  checkMinimumCalorieSafety,
  checkWeeklyWeightLossSafety,
  generatePlanWarnings,
} from './warnings'
import type { DailyPlan, FoodReference } from './types'
import { calculatePlan } from './plan'

describe('checkMinimumCalorieSafety', () => {
  it('minimum sınırın altındaysa danger uyarısı üretir', () => {
    const warnings = checkMinimumCalorieSafety(1000, 'female')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('danger')
    expect(warnings[0]?.code).toBe('BELOW_MINIMUM_CALORIE')
  })

  it('minimum sınırın üstündeyse uyarı üretmez', () => {
    expect(checkMinimumCalorieSafety(1800, 'female')).toEqual([])
  })

  it('erkek ve kadın için farklı eşik kullanır', () => {
    // 1300 kcal: kadın için güvenli (min 1200), erkek için değil (min 1500).
    expect(checkMinimumCalorieSafety(1300, 'female')).toEqual([])
    expect(checkMinimumCalorieSafety(1300, 'male')).toHaveLength(1)
  })
})

describe('checkWeeklyWeightLossSafety', () => {
  it('haftada 1 kg üstü kayıp öneriyorsa uyarır', () => {
    // Günlük 1200 kcal açık × 7 / 7700 ≈ 1.09 kg/hafta
    const warnings = checkWeeklyWeightLossSafety(1200)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('danger')
  })

  it('güvenli açıkta uyarı üretmez', () => {
    // Günlük 500 kcal açık × 7 / 7700 ≈ 0.45 kg/hafta
    expect(checkWeeklyWeightLossSafety(500)).toEqual([])
  })
})

describe('checkImputedDataWarnings', () => {
  const imputedFood: FoodReference = {
    id: 'x',
    nameTr: 'Tahmini besin',
    nutrientsPer100g: {},
    hasImputedValues: true,
  }
  const directFood: FoodReference = { id: 'y', nameTr: 'Doğrudan besin', nutrientsPer100g: {} }

  it('tahmini değeri olan besinler için info uyarısı üretir', () => {
    const plan: DailyPlan = { meals: [{ name: 'Öğün', items: [{ food: imputedFood, grams: 100 }] }] }
    const warnings = checkImputedDataWarnings(plan)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe('info')
  })

  it('tüm besinler doğrudansa uyarı üretmez', () => {
    const plan: DailyPlan = { meals: [{ name: 'Öğün', items: [{ food: directFood, grams: 100 }] }] }
    expect(checkImputedDataWarnings(plan)).toEqual([])
  })
})

describe('generatePlanWarnings', () => {
  it('tüm kontrolleri birleştirir', () => {
    const imputedFood: FoodReference = {
      id: 'x',
      nameTr: 'Düşük kalorili besin',
      nutrientsPer100g: { ENERC_KCAL: 50 },
      hasImputedValues: true,
    }
    const plan: DailyPlan = { meals: [{ name: 'Öğün', items: [{ food: imputedFood, grams: 100 }] }] }
    const planResult = calculatePlan(plan)

    const warnings = generatePlanWarnings(plan, planResult, { sex: 'female' })

    expect(warnings.some((w) => w.code === 'BELOW_MINIMUM_CALORIE')).toBe(true)
    expect(warnings.some((w) => w.code === 'IMPUTED_DATA')).toBe(true)
  })
})
