import { describe, expect, it } from 'vitest'
import { calculateRecipeNutrition } from './recipe'

describe('calculateRecipeNutrition', () => {
  it('calculates deterministic total, cooked 100g and serving values', () => {
    const result = calculateRecipeNutrition({
      ingredients: [
        { amountGrams: 200, nutrientsPer100g: { PROCNT: 10, CHOCDF: 20, FAT: 5 } },
        { amountGrams: 100, nutrientsPer100g: { PROCNT: 4, CHOCDF: 8, FAT: 2 } },
      ],
      totalYieldGrams: 600,
      servings: 3,
    })
    expect(result.nutrients.PROCNT?.total).toBeCloseTo(24)
    expect(result.nutrients.PROCNT?.per100g).toBeCloseTo(4)
    expect(result.nutrients.PROCNT?.perServing).toBeCloseTo(8)
    expect(result.nutrients.CHOCDF?.total).toBeCloseTo(48)
    expect(result.nutrients.FAT?.total).toBeCloseTo(12)
  })

  it('preserves missing-as-unknown and reports weighted coverage', () => {
    const result = calculateRecipeNutrition({
      ingredients: [
        { amountGrams: 200, nutrientsPer100g: { VITB12: 1.2 } },
        { amountGrams: 100, nutrientsPer100g: {} },
      ],
      totalYieldGrams: 300,
      servings: 2,
    })
    expect(result.nutrients.VITB12?.total).toBeCloseTo(2.4)
    expect(result.nutrients.VITB12?.coveragePercent).toBeCloseTo(66.6667)
    expect(result.nutrients.VITB12?.complete).toBe(false)
    expect(result.nutrients.UNKNOWN).toBeUndefined()
  })

  it('applies only explicit retention factors and rejects invalid numbers', () => {
    const result = calculateRecipeNutrition({
      ingredients: [{ amountGrams: 100, nutrientsPer100g: { VITC: 10 } }],
      totalYieldGrams: 80,
      servings: 1,
      retentionFactors: { VITC: 0.5 },
    })
    expect(result.nutrients.VITC?.total).toBe(5)
    expect(result.nutrients.VITC?.per100g).toBeCloseTo(6.25)
    expect(() =>
      calculateRecipeNutrition({
        ingredients: [{ amountGrams: Number.NaN, nutrientsPer100g: {} }],
        totalYieldGrams: 100,
        servings: 1,
      }),
    ).toThrow('Malzeme gramı')
  })
})
