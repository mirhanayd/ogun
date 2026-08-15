// Sık kullanılan besin öğesi kodları (bkz. packages/db/src/seed/nutrients.ts).
// NutrientCode kasıtlı olarak açık (string) bırakıldı: bu paket DB şemasına
// bağımlı değil, kod listesi zamanla genişleyebilir.
export const NUTRIENT = {
  ENERGY_KCAL: 'ENERC_KCAL',
  PROTEIN: 'PROCNT',
  CARB: 'CHOCDF',
  FAT: 'FAT',
  FIBER: 'FIBTG',
  ALCOHOL: 'ALC',
} as const

export type NutrientCode = string

export type NutrientValuesPer100g = Record<NutrientCode, number>

export interface Portion {
  label: string
  grams: number
}

export interface FoodReference {
  id: string
  nameTr: string
  nutrientsPer100g: NutrientValuesPer100g
  // Bu besinin en az bir besin öğesi değeri tahmini (isImputed) mi — DB'deki
  // food_nutrients.isImputed'ın plana taşınmış özeti. Uyarı kanalı bunu kullanır.
  hasImputedValues?: boolean
}

export interface MealItem {
  food: FoodReference
  grams: number
}

export interface Meal {
  name: string
  items: MealItem[]
}

export interface DailyPlan {
  meals: Meal[]
}
