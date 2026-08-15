import { describe, expect, it } from 'vitest'
import { calculateMealNutrients, calculatePlan } from './plan'
import type { DailyPlan, FoodReference, Meal } from './types'

// Elle hesaplanmış referans senaryo (golden test):
// Food A (100g): 200 kcal, 20g protein, 5g yağ, 10g karb.
// Food B (100g): 100 kcal, 5g protein, 2g yağ, 15g karb.
const foodA: FoodReference = {
  id: 'a',
  nameTr: 'Besin A',
  nutrientsPer100g: { ENERC_KCAL: 200, PROCNT: 20, FAT: 5, CHOCDF: 10 },
}
const foodB: FoodReference = {
  id: 'b',
  nameTr: 'Besin B',
  nutrientsPer100g: { ENERC_KCAL: 100, PROCNT: 5, FAT: 2, CHOCDF: 15 },
}

describe('calculateMealNutrients', () => {
  it('öğündeki tüm besinlerin ölçeklenmiş değerlerini toplar', () => {
    // 150g Besin A (300 kcal, 30g P, 7.5g F, 15g K) + 50g Besin B (50 kcal, 2.5g P, 1g F, 7.5g K)
    const meal: Meal = {
      name: 'Kahvaltı',
      items: [
        { food: foodA, grams: 150 },
        { food: foodB, grams: 50 },
      ],
    }

    const result = calculateMealNutrients(meal)

    expect(result.ENERC_KCAL).toBeCloseTo(350)
    expect(result.PROCNT).toBeCloseTo(32.5)
    expect(result.FAT).toBeCloseTo(8.5)
    expect(result.CHOCDF).toBeCloseTo(22.5)
  })
})

describe('calculatePlan', () => {
  it('öğün bazlı ve günlük toplam değerleri doğru hesaplar', () => {
    // Kahvaltı: 350 kcal, 32.5g P, 8.5g F, 22.5g K (yukarıdaki senaryo)
    // Öğle: 200g Besin A → 400 kcal, 40g P, 10g F, 20g K
    // Günlük toplam: 750 kcal, 72.5g P, 18.5g F, 42.5g K
    const plan: DailyPlan = {
      meals: [
        {
          name: 'Kahvaltı',
          items: [
            { food: foodA, grams: 150 },
            { food: foodB, grams: 50 },
          ],
        },
        {
          name: 'Öğle',
          items: [{ food: foodA, grams: 200 }],
        },
      ],
    }

    const result = calculatePlan(plan)

    expect(result.mealNutrients).toHaveLength(2)
    expect(result.mealNutrients[0]?.nutrients.ENERC_KCAL).toBeCloseTo(350)
    expect(result.mealNutrients[1]?.nutrients.ENERC_KCAL).toBeCloseTo(400)

    expect(result.totalNutrients.ENERC_KCAL).toBeCloseTo(750)
    expect(result.totalNutrients.PROCNT).toBeCloseTo(72.5)
    expect(result.totalNutrients.FAT).toBeCloseTo(18.5)
    expect(result.totalNutrients.CHOCDF).toBeCloseTo(42.5)
  })

  it('boş plan için tüm toplamları boş döner', () => {
    const result = calculatePlan({ meals: [] })
    expect(result.mealNutrients).toEqual([])
    expect(result.totalNutrients).toEqual({})
  })
})
