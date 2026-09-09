import type { NutrientValuesPer100g } from './types'

export interface RecipeNutritionIngredient {
  amountGrams: number
  nutrientsPer100g: NutrientValuesPer100g
}

export interface RecipeNutrientResult {
  code: string
  total: number | null
  per100g: number | null
  perServing: number | null
  coveragePercent: number
  complete: boolean
}

export interface RecipeNutritionResult {
  nutrients: Record<string, RecipeNutrientResult>
  totalIngredientGrams: number
  totalYieldGrams: number
  servings: number
  retentionApplied: boolean
}

/**
 * Canonical system-recipe calculator. Missing nutrient values are omitted from
 * the arithmetic and represented with coverage; they are never coerced to zero.
 * Retention is applied only when the caller resolved an explicit canonical factor.
 */
export function calculateRecipeNutrition(input: {
  ingredients: RecipeNutritionIngredient[]
  totalYieldGrams: number
  servings: number
  retentionFactors?: Record<string, number>
}): RecipeNutritionResult {
  if (!Number.isFinite(input.totalYieldGrams) || input.totalYieldGrams <= 0)
    throw new Error('Toplam pişmiş ağırlık sıfırdan büyük olmalıdır.')
  if (!Number.isInteger(input.servings) || input.servings < 1)
    throw new Error('Porsiyon sayısı en az 1 olmalıdır.')
  if (input.ingredients.length === 0) throw new Error('Tarifte en az bir malzeme olmalıdır.')
  for (const ingredient of input.ingredients) {
    if (!Number.isFinite(ingredient.amountGrams) || ingredient.amountGrams <= 0)
      throw new Error('Malzeme gramı sıfırdan büyük olmalıdır.')
  }

  const totalIngredientGrams = input.ingredients.reduce((sum, item) => sum + item.amountGrams, 0)
  const codes = new Set(input.ingredients.flatMap((item) => Object.keys(item.nutrientsPer100g)))
  const nutrients: Record<string, RecipeNutrientResult> = {}

  for (const code of codes) {
    let knownGrams = 0
    let knownTotal = 0
    for (const ingredient of input.ingredients) {
      const value = ingredient.nutrientsPer100g[code]
      if (value === undefined) continue
      if (!Number.isFinite(value) || value < 0)
        throw new Error(`${code} için geçersiz besin değeri.`)
      knownGrams += ingredient.amountGrams
      knownTotal += (value * ingredient.amountGrams) / 100
    }
    const retention = input.retentionFactors?.[code]
    if (retention !== undefined && (!Number.isFinite(retention) || retention < 0 || retention > 1))
      throw new Error(`${code} için retention factor 0–1 aralığında olmalıdır.`)
    const total = knownGrams === 0 ? null : knownTotal * (retention ?? 1)
    const coveragePercent = (knownGrams / totalIngredientGrams) * 100
    nutrients[code] = {
      code,
      total,
      per100g: total === null ? null : (total / input.totalYieldGrams) * 100,
      perServing: total === null ? null : total / input.servings,
      coveragePercent,
      complete: Math.abs(coveragePercent - 100) < 1e-9,
    }
  }

  return {
    nutrients,
    totalIngredientGrams,
    totalYieldGrams: input.totalYieldGrams,
    servings: input.servings,
    retentionApplied: Boolean(input.retentionFactors && Object.keys(input.retentionFactors).length),
  }
}
