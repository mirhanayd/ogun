import type { NutrientValuesPer100g } from './types'

// Diyetisyenlerin alışık olduğu "değişim listesi" mantığı: bir besin grubunun
// 1 değişimi (exchange), belirli bir gram karşılığı ve o gruba özgü ortalama
// besin öğesi değerlerini temsil eder. Grup tanımları (gramsPerExchange,
// nutrientsPerExchange) burada değil, çağıran koddaki veri setinde tutulur —
// bu modül sadece dönüşüm mantığını sağlar.
export interface ExchangeGroupDefinition {
  code: string
  nameTr: string
  gramsPerExchange: number
  nutrientsPerExchange: NutrientValuesPer100g
}

export function gramsToExchanges(grams: number, group: ExchangeGroupDefinition): number {
  if (group.gramsPerExchange === 0) return 0
  return grams / group.gramsPerExchange
}

export function exchangesToGrams(exchanges: number, group: ExchangeGroupDefinition): number {
  return exchanges * group.gramsPerExchange
}

// Verilen değişim adedinin toplam besin öğesi değeri (örn. 2.5 "et değişimi" → kaç g protein).
export function exchangesToNutrients(exchanges: number, group: ExchangeGroupDefinition): NutrientValuesPer100g {
  const result: NutrientValuesPer100g = {}
  for (const [code, valuePerExchange] of Object.entries(group.nutrientsPerExchange)) {
    result[code] = valuePerExchange * exchanges
  }
  return result
}
