import { describe, expect, it } from 'vitest'
import {
  checkImputedDataWarnings,
  checkImputedValueHeavy,
  checkMinimumCalorieSafety,
  checkMissingNutrientData,
  checkUnsafeEnergyTarget,
  checkWeeklyWeightLossSafety,
  generateLiveNutrientWarnings,
  generatePlanWarnings,
} from './warnings'
import type { AgeGroupReference } from './reference-comparison'
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

describe('checkMissingNutrientData', () => {
  const withIron: FoodReference = { id: 'a', nameTr: 'Demirli besin', nutrientsPer100g: { FE: 5 } }
  const withoutIron: FoodReference = { id: 'b', nameTr: 'Demirsiz besin', nutrientsPer100g: {} }

  it('bir besin öğesi kodu eksik olan kalem sayısını rapor eder', () => {
    const plan: DailyPlan = {
      meals: [
        {
          name: 'Öğün',
          items: [
            { food: withIron, grams: 100 },
            { food: withoutIron, grams: 100 },
            { food: withoutIron, grams: 50 },
          ],
        },
      ],
    }
    const warnings = checkMissingNutrientData(plan, ['FE'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('MISSING_NUTRIENT_DATA')
    expect(warnings[0]?.message).toContain('2 kalemde')
    expect(warnings[0]?.message).toContain('demir')
  })

  it('tüm kalemlerde veri varsa uyarı üretmez', () => {
    const plan: DailyPlan = { meals: [{ name: 'Öğün', items: [{ food: withIron, grams: 100 }] }] }
    expect(checkMissingNutrientData(plan, ['FE'])).toEqual([])
  })
})

describe('checkImputedValueHeavy', () => {
  it('tahmini veriden gelen kcal oranı eşiği aşarsa uyarır', () => {
    const imputed: FoodReference = {
      id: 'a',
      nameTr: 'Tahmini',
      nutrientsPer100g: { ENERC_KCAL: 400 },
      hasImputedValues: true,
    }
    const direct: FoodReference = {
      id: 'b',
      nameTr: 'Doğrudan',
      nutrientsPer100g: { ENERC_KCAL: 100 },
    }
    // 100g tahmini (400 kcal) + 100g doğrudan (100 kcal) = 500 kcal toplam, %80 tahmini
    const plan: DailyPlan = {
      meals: [
        { name: 'Öğün', items: [{ food: imputed, grams: 100 }, { food: direct, grams: 100 }] },
      ],
    }
    const planResult = calculatePlan(plan)
    const warnings = checkImputedValueHeavy(plan, planResult)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('IMPUTED_VALUE_HEAVY')
    expect(warnings[0]?.message).toContain('%80')
  })

  it('eşiğin altındaysa uyarı üretmez', () => {
    const imputed: FoodReference = {
      id: 'a',
      nameTr: 'Tahmini',
      nutrientsPer100g: { ENERC_KCAL: 50 },
      hasImputedValues: true,
    }
    const direct: FoodReference = { id: 'b', nameTr: 'Doğrudan', nutrientsPer100g: { ENERC_KCAL: 950 } }
    const plan: DailyPlan = {
      meals: [{ name: 'Öğün', items: [{ food: imputed, grams: 100 }, { food: direct, grams: 100 }] }],
    }
    const planResult = calculatePlan(plan)
    expect(checkImputedValueHeavy(plan, planResult)).toEqual([])
  })
})

describe('checkUnsafeEnergyTarget', () => {
  const reference: AgeGroupReference = {
    ageGroupCode: 'TEST',
    ageGroupLabel: 'Test',
    sex: 'all',
    ranges: [{ nutrientCode: 'ENERC_KCAL', min: 1800, max: 2200, unit: 'kcal' }],
  }

  it('hedef referans aralığının altındaysa danger uyarısı üretir', () => {
    const warnings = checkUnsafeEnergyTarget(1200, reference)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('UNSAFE_ENERGY_TARGET')
    expect(warnings[0]?.severity).toBe('danger')
  })

  it('hedef referans aralığının üstündeyse danger uyarısı üretir', () => {
    expect(checkUnsafeEnergyTarget(3000, reference)).toHaveLength(1)
  })

  it('hedef aralık içindeyse uyarı üretmez', () => {
    expect(checkUnsafeEnergyTarget(2000, reference)).toEqual([])
  })

  it('hedef veya referans yoksa uyarı üretmez', () => {
    expect(checkUnsafeEnergyTarget(null, reference)).toEqual([])
    expect(checkUnsafeEnergyTarget(1200, null)).toEqual([])
  })
})

describe('generateLiveNutrientWarnings', () => {
  it('tüm canlı panel kontrollerini birleştirir', () => {
    const missingFood: FoodReference = { id: 'a', nameTr: 'Eksik veri', nutrientsPer100g: { ENERC_KCAL: 1000 } }
    const plan: DailyPlan = { meals: [{ name: 'Öğün', items: [{ food: missingFood, grams: 100 }] }] }
    const planResult = calculatePlan(plan)
    const reference: AgeGroupReference = {
      ageGroupCode: 'TEST',
      ageGroupLabel: 'Test',
      sex: 'all',
      ranges: [{ nutrientCode: 'ENERC_KCAL', min: 1800, max: 2200, unit: 'kcal' }],
    }

    const warnings = generateLiveNutrientWarnings(plan, planResult, {
      targetKcal: 1000,
      reference,
      coreNutrientCodes: ['FE'],
    })

    expect(warnings.some((w) => w.code === 'MISSING_NUTRIENT_DATA')).toBe(true)
    expect(warnings.some((w) => w.code === 'UNSAFE_ENERGY_TARGET')).toBe(true)
  })
})
