import { scaleNutrientsToGrams } from './portion'
import type { DailyPlan, Meal, MealItem, NutrientValuesPer100g } from './types'

function sumNutrients(a: NutrientValuesPer100g, b: NutrientValuesPer100g): NutrientValuesPer100g {
  const result: NutrientValuesPer100g = { ...a }
  for (const [code, value] of Object.entries(b)) {
    result[code] = (result[code] ?? 0) + value
  }
  return result
}

export function calculateMealItemNutrients(item: MealItem): NutrientValuesPer100g {
  return scaleNutrientsToGrams(item.food.nutrientsPer100g, item.grams)
}

export function calculateMealNutrients(meal: Meal): NutrientValuesPer100g {
  return meal.items.reduce<NutrientValuesPer100g>(
    (total, item) => sumNutrients(total, calculateMealItemNutrients(item)),
    {},
  )
}

export interface MealNutrients {
  mealName: string
  nutrients: NutrientValuesPer100g
}

export interface PlanCalculationResult {
  totalNutrients: NutrientValuesPer100g
  mealNutrients: MealNutrients[]
}

// Bir günlük planın öğün bazlı ve toplam besin öğesi değerlerini hesaplar.
export function calculatePlan(plan: DailyPlan): PlanCalculationResult {
  const mealNutrients = plan.meals.map((meal) => ({
    mealName: meal.name,
    nutrients: calculateMealNutrients(meal),
  }))

  const totalNutrients = mealNutrients.reduce<NutrientValuesPer100g>(
    (total, meal) => sumNutrients(total, meal.nutrients),
    {},
  )

  return { totalNutrients, mealNutrients }
}
