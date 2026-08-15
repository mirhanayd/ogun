import { calculatePlan } from './plan'
import { calculateMacroDistribution, calculateMealEnergyDistribution } from './distribution'
import { generatePlanWarnings } from './warnings'
import type { DailyPlan, FoodReference, Meal } from './types'

// Büyük bir günlük planın hesaplama gecikmesini ölçer: `tsx src/benchmark.ts`.
// Gerçek DB'ye bağımlı değil (sentetik veri) — nutrition-core'un DB'den
// bağımsız kalma ilkesiyle tutarlı.

function buildSyntheticFood(index: number): FoodReference {
  return {
    id: `food-${index}`,
    nameTr: `Besin ${index}`,
    nutrientsPer100g: {
      ENERC_KCAL: 100 + (index % 50) * 4,
      PROCNT: 5 + (index % 20),
      FAT: 2 + (index % 10),
      CHOCDF: 10 + (index % 30),
      FIBTG: 1 + (index % 5),
      NA: 50 + (index % 100),
      CA: 20 + (index % 50),
    },
  }
}

function buildSyntheticPlan(mealCount: number, itemsPerMeal: number): DailyPlan {
  const meals: Meal[] = []
  let foodIndex = 0
  for (let m = 0; m < mealCount; m++) {
    const items = Array.from({ length: itemsPerMeal }, () => {
      foodIndex++
      return { food: buildSyntheticFood(foodIndex), grams: 50 + (foodIndex % 200) }
    })
    meals.push({ name: `Öğün ${m + 1}`, items })
  }
  return { meals }
}

function benchmark(label: string, mealCount: number, itemsPerMeal: number, iterations: number) {
  const plan = buildSyntheticPlan(mealCount, itemsPerMeal)
  const totalItems = mealCount * itemsPerMeal

  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    const result = calculatePlan(plan)
    calculateMacroDistribution(result.totalNutrients)
    calculateMealEnergyDistribution(result)
    generatePlanWarnings(plan, result, { sex: 'female' })
  }
  const elapsedMs = performance.now() - start
  const perRunMs = elapsedMs / iterations

  console.log(
    `${label}: ${mealCount} öğün × ${itemsPerMeal} kalem (${totalItems} toplam) — ` +
      `${iterations} tekrar, ortalama ${perRunMs.toFixed(3)} ms/çalıştırma`,
  )
}

console.log('--- nutrition-core benchmark ---')
benchmark('Küçük plan', 3, 5, 1000)
benchmark('Orta plan', 5, 15, 500)
benchmark('Büyük plan', 10, 50, 100)
benchmark('Uç durum', 20, 100, 20)
