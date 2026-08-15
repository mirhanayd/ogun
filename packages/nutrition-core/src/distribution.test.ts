import { describe, expect, it } from 'vitest'
import { calculateMacroDistribution, calculateMealEnergyDistribution } from './distribution'
import type { PlanCalculationResult } from './plan'

describe('calculateMacroDistribution', () => {
  it('golden test: enerjinin makro besin öğelerine yüzdesel dağılımı', () => {
    // 50g protein (200 kcal) + 70g yağ (630 kcal) + 130g karb (520 kcal) = 1350 kcal
    const result = calculateMacroDistribution({ PROCNT: 50, FAT: 70, CHOCDF: 130 })

    expect(result.proteinPercent).toBeCloseTo((200 / 1350) * 100, 2)
    expect(result.fatPercent).toBeCloseTo((630 / 1350) * 100, 2)
    expect(result.carbPercent).toBeCloseTo((520 / 1350) * 100, 2)
    expect(result.proteinPercent + result.fatPercent + result.carbPercent).toBeCloseTo(100)
  })

  it('makro besin öğesi yoksa tüm yüzdeleri 0 döner', () => {
    const result = calculateMacroDistribution({})
    expect(result).toEqual({ proteinPercent: 0, fatPercent: 0, carbPercent: 0 })
  })
})

describe('calculateMealEnergyDistribution', () => {
  it('günlük toplam enerjinin öğünler arası dağılımını hesaplar', () => {
    const plan: PlanCalculationResult = {
      totalNutrients: { ENERC_KCAL: 750 },
      mealNutrients: [
        { mealName: 'Kahvaltı', nutrients: { ENERC_KCAL: 350 } },
        { mealName: 'Öğle', nutrients: { ENERC_KCAL: 400 } },
      ],
    }

    const result = calculateMealEnergyDistribution(plan)

    expect(result[0]).toEqual({ mealName: 'Kahvaltı', kcal: 350, percentOfDailyTotal: (350 / 750) * 100 })
    expect(result[1]).toEqual({ mealName: 'Öğle', kcal: 400, percentOfDailyTotal: (400 / 750) * 100 })
  })

  it('günlük toplam 0 ise yüzdeleri 0 döner (bölme hatasını önler)', () => {
    const plan: PlanCalculationResult = {
      totalNutrients: {},
      mealNutrients: [{ mealName: 'Kahvaltı', nutrients: {} }],
    }

    const result = calculateMealEnergyDistribution(plan)
    expect(result[0]?.percentOfDailyTotal).toBe(0)
  })
})
