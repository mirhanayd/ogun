import type { NutrientValuesPer100g, Portion } from './types'

// 100g başına değerden, verilen gram miktarına göre besin öğesi değerini hesaplar.
export function scaleNutrientsToGrams(
  nutrientsPer100g: NutrientValuesPer100g,
  grams: number,
): NutrientValuesPer100g {
  const factor = grams / 100
  const result: NutrientValuesPer100g = {}
  for (const [code, valuePer100g] of Object.entries(nutrientsPer100g)) {
    result[code] = valuePer100g * factor
  }
  return result
}

// Ev ölçüsü porsiyonunu grama çevirir ("2 kase" gibi adet belirtilen durumlar için).
export function portionToGrams(portion: Portion, quantity = 1): number {
  return portion.grams * quantity
}

// Gramı, verilen porsiyonun kaç katı olduğuna çevirir (örn. 300g / "1 kase" = 250g → 1.2).
export function gramsToPortionQuantity(portion: Portion, grams: number): number {
  if (portion.grams === 0) return 0
  return grams / portion.grams
}
